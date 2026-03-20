import Anthropic from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";
import { config, AGENT_MODEL, MAX_AGENT_ITERATIONS, TOKEN_LIMITS, THINKING_BUDGETS } from "../config.js";
import { buildContext } from "./context.js";
import { getPendingAction, isConfirmation, executePendingAction } from "./confirmation.js";
import { buildSystemPrompt } from "./system-prompt.js";
import { executePrimitive, getPrimitiveDefinitions } from "../primitives/index.js";
import { db } from "../db/connection.js";
import { agentRuns, messages, generatedFiles } from "../db/schema.js";
import type { AgentResponse, PrimitiveCallLog, AgentRunTrigger } from "@kommand/shared";

const anthropic = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY || "sk-ant-placeholder" });

// Primitives that return external business data and must be XML-wrapped for
// prompt-injection defence per SECURITY.md
const BUSINESS_DATA_PRIMITIVES = new Set(["shopify_api", "xero_api", "web_search"]);

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

  // Hoisted for access in catch block
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let iterations = 0;
  const primitiveLogs: PrimitiveCallLog[] = [];

  try {
    // 1. Load context (pass current message for vector similarity memory retrieval)
    const context = await buildContext(tenantId, inboundMessage);

    // 2. Check for pending confirmation
    const pending = await getPendingAction(tenantId);
    if (pending && isConfirmation(inboundMessage)) {
      const confirmResult = await executePendingAction(pending, inboundMessage, tenantId, runId);
      if (confirmResult.outcome && confirmResult.text) {
        return await finalizeRun(runId, tenantId, confirmResult.text, 1, 0, 0, [], startTime);
      }
      // Ambiguous — fall through to agent loop with context about the pending action
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

      // Append assistant message with tool_use blocks to conversation history
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

      // Execute primitives in parallel
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

          // Wrap business data in XML tags for prompt-injection defence (SECURITY.md).
          // Escape < and > so a malicious API response can't close the wrapper tag.
          const raw = JSON.stringify(result);
          const content = BUSINESS_DATA_PRIMITIVES.has(block.name)
            ? `<business_data source="${block.name}">${raw.replace(/</g, "\\u003c").replace(/>/g, "\\u003e")}</business_data>`
            : raw;

          return {
            type: "tool_result" as const,
            tool_use_id: block.id,
            content,
          };
        })
      );

      msgs.push({ role: "user", content: toolResults });

      // Check token budget — after appending tool results so conversation stays valid
      if (totalInputTokens + totalOutputTokens >= tokenLimit) {
        msgs.push({
          role: "user",
          content: "Token budget reached. Please summarize what you have and deliver your best answer to the owner now.",
        });
        break;
      }

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
    const latencyMs = Date.now() - startTime;

    await db
      .update(agentRuns)
      .set({ status: "failed", error: errorMessage, latencyMs })
      .where(eq(agentRuns.id, runId));

    return {
      text: "I'm having trouble thinking right now. Try again in a minute.",
      agentRunId: runId,
      iterations,
      tokensUsed: totalInputTokens + totalOutputTokens,
      latencyMs,
      primitivesCalled: primitiveLogs,
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
    // Only retry on transient errors (5xx, timeouts, network failures)
    const status = (err as { status?: number }).status;
    const isTransient = !status || status >= 500 || status === 429;
    if (!isTransient) {
      throw err;
    }
    console.warn("[agent] Claude API transient failure, retrying in 2s…", err instanceof Error ? err.message : err);
    await sleep(2000);
    return await anthropic.messages.create(params);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

  // Collect any files generated during this run by the primitives
  const runFiles = await db
    .select({ url: generatedFiles.downloadUrl, filename: generatedFiles.filename })
    .from(generatedFiles)
    .where(eq(generatedFiles.agentRunId, runId));

  return {
    text,
    ...(runFiles.length > 0 ? { files: runFiles } : {}),
    agentRunId: runId,
    iterations,
    tokensUsed,
    latencyMs,
    primitivesCalled: primitiveLogs,
  };
}
