import Anthropic from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";
import { config, AGENT_MODEL, MAX_AGENT_ITERATIONS, TOKEN_LIMITS, THINKING_BUDGETS } from "../config.js";
import { buildContext, getPendingConfirmation, isConfirmation } from "./context.js";
import { buildSystemPrompt } from "./system-prompt.js";
import { executePrimitive, getPrimitiveDefinitions } from "../primitives/index.js";
import { db } from "../db/connection.js";
import { agentRuns, pendingActions, messages } from "../db/schema.js";
import type { AgentResponse, PrimitiveCallLog, AgentRunTrigger } from "@kommand/shared";

const anthropic = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY || "sk-ant-placeholder" });

type ClaudeMessage = Anthropic.MessageParam;

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

  const runId = runRecord!.id;

  try {
    // 1. Load context
    const context = await buildContext(tenantId);

    // 2. Check for pending confirmation
    const pending = await getPendingConfirmation(tenantId);
    if (pending && isConfirmation(inboundMessage)) {
      return await handlePendingConfirmation(pending, inboundMessage, tenantId, runId, startTime);
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

      const response = await callClaude(systemPrompt, tools, msgs, thinkingBudget);

      totalInputTokens += response.usage.input_tokens;
      totalOutputTokens += response.usage.output_tokens;

      const textBlocks = response.content.filter(
        (b): b is Anthropic.TextBlock => b.type === "text"
      );
      const toolBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
      );

      // No tool calls = final answer
      if (toolBlocks.length === 0) {
        const finalText = textBlocks.map((b) => b.text).join("\n");
        return await finalizeRun(
          runId, tenantId, finalText, iterations,
          totalInputTokens, totalOutputTokens,
          primitiveLogs, startTime
        );
      }

      // Check token budget
      if (totalInputTokens + totalOutputTokens >= tokenLimit) {
        msgs.push({
          role: "user",
          content: "Token budget reached. Please summarize what you have and deliver your best answer to the owner now.",
        });
        break;
      }

      // Execute primitives in parallel
      // response.content contains TextBlock | ToolUseBlock — cast to the param equivalents
      msgs.push({
        role: "assistant",
        content: response.content.map((b) => {
          if (b.type === "tool_use") {
            return { type: "tool_use" as const, id: b.id, name: b.name, input: b.input };
          }
          if (b.type === "text") {
            return { type: "text" as const, text: b.text };
          }
          // thinking blocks — pass through as-is (SDK accepts them)
          return b as unknown as Anthropic.TextBlockParam;
        }),
      });

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
          content: "You've used many steps. Please summarize what you've found so far and deliver your best answer to the owner now.",
        });
      }
    }

    // Force final response after max iterations or token budget
    const finalResponse = await callClaude(systemPrompt, [], msgs, undefined, 4000);

    totalInputTokens += finalResponse.usage.input_tokens;
    totalOutputTokens += finalResponse.usage.output_tokens;

    const finalText = finalResponse.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    return await finalizeRun(
      runId, tenantId, finalText, iterations,
      totalInputTokens, totalOutputTokens,
      primitiveLogs, startTime
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    await db
      .update(agentRuns)
      .set({ status: "failed", error: errorMessage, latencyMs: Date.now() - startTime })
      .where(eq(agentRuns.id, runId));

    return {
      text: "I'm having trouble thinking right now. Try again in a minute.",
      agentRunId: runId,
      iterations: 0,
      tokensUsed: 0,
      latencyMs: Date.now() - startTime,
      primitivesCalled: [],
    };
  }
}

// ─── Claude API call with retry ───────────────────────────────────────────────

async function callClaude(
  system: string,
  tools: Anthropic.Tool[],
  messages: ClaudeMessage[],
  thinkingBudget?: number,
  maxTokens = 16000
): Promise<Anthropic.Message> {
  const params: Anthropic.MessageCreateParamsNonStreaming = {
    model: AGENT_MODEL,
    max_tokens: maxTokens,
    system,
    messages,
    ...(tools.length > 0 ? { tools } : {}),
    ...(thinkingBudget ? { thinking: { type: "enabled" as const, budget_tokens: thinkingBudget } } : {}),
  };

  try {
    return await anthropic.messages.create(params);
  } catch (err) {
    // Retry once after 2s
    console.warn("[agent] Claude API failed, retrying in 2s…", err instanceof Error ? err.message : err);
    await sleep(2000);
    return await anthropic.messages.create(params);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Pending confirmation handler ─────────────────────────────────────────────

async function handlePendingConfirmation(
  pending: typeof pendingActions.$inferSelect,
  reply: string,
  tenantId: string,
  runId: string,
  startTime: number
): Promise<AgentResponse> {
  const normalized = reply.toLowerCase().trim();
  const isYes = ["yes", "yeah", "yep", "confirm", "go ahead", "do it", "send it", "ok", "okay"].some(
    (p) => normalized === p || normalized.startsWith(p + " ")
  );

  if (isYes) {
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

    return await finalizeRun(runId, tenantId, responseText, 1, 0, 0, [], startTime);
  } else {
    await db
      .update(pendingActions)
      .set({ status: "cancelled", resolvedAt: new Date() })
      .where(eq(pendingActions.id, pending.id));

    return await finalizeRun(runId, tenantId, "Got it — cancelled.", 1, 0, 0, [], startTime);
  }
}

// ─── Finalize run ─────────────────────────────────────────────────────────────

async function finalizeRun(
  runId: string,
  tenantId: string,
  text: string,
  iterations: number,
  tokensInput: number,
  tokensOutput: number,
  primitiveLogs: PrimitiveCallLog[],
  startTime: number
): Promise<AgentResponse> {
  const latencyMs = Date.now() - startTime;
  const tokensUsed = tokensInput + tokensOutput;

  await db
    .update(agentRuns)
    .set({
      output: text,
      iterations,
      primitiveCalls: primitiveLogs,
      tokensInput,
      tokensOutput,
      latencyMs,
      status: "completed",
    })
    .where(eq(agentRuns.id, runId));

  // Store assistant message
  await db.insert(messages).values({
    tenantId,
    direction: "outbound",
    role: "assistant",
    content: text,
    agentRunId: runId,
  });

  return { text, agentRunId: runId, iterations, tokensUsed, latencyMs, primitivesCalled: primitiveLogs };
}
