import Anthropic from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";
import { config, AGENT_MODEL, MAX_AGENT_ITERATIONS, TOKEN_LIMITS, THINKING_BUDGETS } from "../config.js";
import { buildContext, getPendingConfirmation, isConfirmation } from "./context.js";
import { buildSystemPrompt } from "./system-prompt.js";
import { executePrimitive, getPrimitiveDefinitions } from "../primitives/index.js";
import { db } from "../db/connection.js";
import { agentRuns, pendingActions, messages } from "../db/schema.js";
import type { AgentResponse, PrimitiveCallLog, AgentRunTrigger } from "@kommand/shared";

const anthropic = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });

type ClaudeMessage = Anthropic.MessageParam;
type ContentBlock = Anthropic.ContentBlock;

function collectPrimitiveLog(msgs: ClaudeMessage[]): PrimitiveCallLog[] {
  const logs: PrimitiveCallLog[] = [];
  for (const msg of msgs) {
    if (msg.role === "assistant" && Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === "tool_use") {
          logs.push({
            name: block.name as PrimitiveCallLog["name"],
            inputSummary: JSON.stringify(block.input).slice(0, 200),
            success: true, // updated below from tool_results
            latencyMs: 0,
          });
        }
      }
    }
  }
  return logs;
}

export async function runAgent(
  inboundMessage: string,
  tenantId: string,
  trigger: AgentRunTrigger = "message"
): Promise<AgentResponse> {
  const startTime = Date.now();

  // Create agent run record
  const [runRecord] = await db
    .insert(agentRuns)
    .values({
      tenantId,
      trigger,
      input: inboundMessage,
      status: "running",
    })
    .returning({ id: agentRuns.id });

  const runId = runRecord?.id;

  try {
    // 1. Load context
    const context = await buildContext(tenantId);

    // 2. Check for pending confirmation
    const pending = await getPendingConfirmation(tenantId);
    if (pending && isConfirmation(inboundMessage)) {
      return await handlePendingConfirmation(
        pending,
        inboundMessage,
        tenantId,
        runId,
        startTime
      );
    }

    // 3. Build message array
    const msgs: ClaudeMessage[] = [
      ...context.conversationHistory.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user" as const, content: inboundMessage },
    ];

    const systemPrompt = buildSystemPrompt(context);
    const tools = getPrimitiveDefinitions(context.connectedPlatforms);
    const tokenLimit = TOKEN_LIMITS[context.tenant.plan] ?? TOKEN_LIMITS["trial"]!;
    const thinkingBudget = THINKING_BUDGETS[context.tenant.plan] ?? THINKING_BUDGETS["trial"]!;

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let iterations = 0;
    const primitiveLogs: PrimitiveCallLog[] = [];

    // 4. Agent loop
    while (iterations < MAX_AGENT_ITERATIONS) {
      iterations++;

      const response = await anthropic.messages.create({
        model: AGENT_MODEL,
        max_tokens: 16000,
        thinking: { type: "enabled", budget_tokens: thinkingBudget },
        system: systemPrompt,
        tools,
        messages: msgs,
      } as Parameters<typeof anthropic.messages.create>[0]);

      totalInputTokens += response.usage.input_tokens;
      totalOutputTokens += response.usage.output_tokens;

      const textBlocks = (response.content as ContentBlock[]).filter(
        (b) => b.type === "text"
      ) as Anthropic.TextBlock[];
      const toolBlocks = (response.content as ContentBlock[]).filter(
        (b) => b.type === "tool_use"
      ) as Anthropic.ToolUseBlock[];

      // No tool calls = final answer
      if (toolBlocks.length === 0) {
        const finalText = textBlocks.map((b) => b.text).join("\n");
        return await finalizeRun(
          runId,
          tenantId,
          finalText,
          iterations,
          totalInputTokens + totalOutputTokens,
          primitiveLogs,
          startTime
        );
      }

      // Check token budget
      if (totalInputTokens + totalOutputTokens >= tokenLimit) {
        msgs.push({
          role: "user",
          content:
            "Token budget reached. Please summarize what you have and deliver your best answer to the owner now.",
        });
        break;
      }

      // Execute primitives in parallel
      msgs.push({ role: "assistant", content: response.content });

      const toolResults = await Promise.all(
        toolBlocks.map(async (block) => {
          const callStart = Date.now();
          const result = await executePrimitive(block.name, block.input as Record<string, unknown>, tenantId, runId);
          const latencyMs = Date.now() - callStart;

          primitiveLogs.push({
            name: block.name as PrimitiveCallLog["name"],
            inputSummary: JSON.stringify(block.input).slice(0, 200),
            success: result.success,
            latencyMs,
          });

          return {
            type: "tool_result" as const,
            tool_use_id: block.id,
            content: JSON.stringify(result),
          };
        })
      );

      msgs.push({ role: "user", content: toolResults });

      // Force wrap-up approaching max iterations
      if (iterations >= MAX_AGENT_ITERATIONS - 5) {
        msgs.push({
          role: "user",
          content:
            "You've used many steps. Please summarize what you've found so far and deliver your best answer to the owner now.",
        });
      }
    }

    // Force final response after max iterations
    const finalResponse = await anthropic.messages.create({
      model: AGENT_MODEL,
      max_tokens: 4000,
      system: systemPrompt,
      messages: msgs,
    });

    totalInputTokens += finalResponse.usage.input_tokens;
    totalOutputTokens += finalResponse.usage.output_tokens;

    const finalText = (finalResponse.content as ContentBlock[])
      .filter((b) => b.type === "text")
      .map((b) => (b as Anthropic.TextBlock).text)
      .join("\n");

    return await finalizeRun(
      runId,
      tenantId,
      finalText,
      iterations,
      totalInputTokens + totalOutputTokens,
      primitiveLogs,
      startTime
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    if (runId) {
      await db
        .update(agentRuns)
        .set({ status: "failed", error: errorMessage, latencyMs: Date.now() - startTime })
        .where(eq(agentRuns.id, runId));
    }

    return {
      text: "I'm having trouble thinking right now. Try again in a minute.",
      iterations: 0,
      tokensUsed: 0,
      primitivesCalled: [],
    };
  }
}

async function handlePendingConfirmation(
  pending: typeof pendingActions.$inferSelect,
  reply: string,
  tenantId: string,
  runId: string | undefined,
  startTime: number
): Promise<AgentResponse> {
  const normalized = reply.toLowerCase().trim();
  const isYes = ["yes", "yeah", "yep", "confirm", "go ahead", "do it", "send it", "ok", "okay"].some(
    (p) => normalized === p || normalized.startsWith(p + " ")
  );

  if (isYes) {
    // Execute the stored primitive call
    const result = await executePrimitive(
      pending.primitiveName,
      pending.primitiveInput as Record<string, unknown>,
      tenantId,
      runId
    );

    await db
      .update(pendingActions)
      .set({ status: "confirmed", resolvedAt: new Date() })
      .where(eq(pendingActions.id, pending.id));

    const responseText = result.success
      ? `✅ Done. ${JSON.stringify(result.data).slice(0, 500)}`
      : `❌ Failed: ${result.error}`;

    return await finalizeRun(runId, tenantId, responseText, 1, 0, [], startTime);
  } else {
    await db
      .update(pendingActions)
      .set({ status: "cancelled", resolvedAt: new Date() })
      .where(eq(pendingActions.id, pending.id));

    return await finalizeRun(runId, tenantId, "Got it — cancelled.", 1, 0, [], startTime);
  }
}

async function finalizeRun(
  runId: string | undefined,
  tenantId: string,
  text: string,
  iterations: number,
  tokensUsed: number,
  primitiveLogs: PrimitiveCallLog[],
  startTime: number
): Promise<AgentResponse> {
  const latencyMs = Date.now() - startTime;

  if (runId) {
    await db
      .update(agentRuns)
      .set({
        output: text,
        iterations,
        primitiveCalls: primitiveLogs,
        tokensInput: tokensUsed,
        latencyMs,
        status: "completed",
      })
      .where(eq(agentRuns.id, runId));
  }

  // Store assistant message
  await db.insert(messages).values({
    tenantId,
    direction: "outbound",
    role: "assistant",
    content: text,
    agentRunId: runId,
  });

  return { text, iterations, tokensUsed, primitivesCalled: primitiveLogs };
}
