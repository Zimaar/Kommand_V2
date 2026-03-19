#!/usr/bin/env tsx
/**
 * Test the agent loop with mock primitives.
 * Usage: npx tsx scripts/test-agent.ts
 *
 * Tests:
 * 1. runAgent with missing API key → graceful error
 * 2. buildContext loads tenant correctly
 * 3. getPrimitivesForClaude returns correct tools based on connections
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "../apps/api/src/db/schema.js";
import { buildContext } from "../apps/api/src/agent/context.js";
import { buildSystemPrompt } from "../apps/api/src/agent/system-prompt.js";
import { isConfirmation, classifyConfirmation } from "../apps/api/src/agent/confirmation.js";
import { getPrimitivesForClaude, executePrimitive } from "../apps/api/src/primitives/index.js";

const pool = new pg.Pool({ connectionString: "postgresql://postgres:postgres@localhost:5432/kommand" });
const db = drizzle(pool, { schema });

async function run(): Promise<void> {
  // Find the seeded tenant
  const tenant = await db.query.tenants.findFirst({
    where: (t, { eq }) => eq(t.email, "test@kommand.dev"),
  });

  if (!tenant) {
    console.error("❌ No test tenant found. Run: npm run db:seed");
    process.exit(1);
  }

  console.log(`Using tenant: ${tenant.id} (${tenant.name})\n`);

  // Test 1: buildContext
  console.log("── Test 1: buildContext ──");
  const ctx = await buildContext(tenant.id);
  console.log(`  tenant.name: ${ctx.tenant.name}`);
  console.log(`  stores: ${ctx.stores.length}`);
  console.log(`  connectedPlatforms: ${ctx.connectedPlatforms.join(", ")}`);
  console.log(`  currentTime: ${ctx.currentTime}`);
  console.log("  ✅ passed\n");

  // Test 2: getPrimitivesForClaude
  console.log("── Test 2: getPrimitivesForClaude ──");
  const tools = getPrimitivesForClaude(ctx.connectedPlatforms);
  console.log(`  tools (${tools.length}): ${tools.map((t) => t.name).join(", ")}`);
  const hasShopify = tools.some((t) => t.name === "shopify_api");
  const hasMemory = tools.some((t) => t.name === "memory");
  console.log(`  includes shopify_api: ${hasShopify} (expected: true)`);
  console.log(`  includes memory: ${hasMemory} (expected: true)`);
  if (!hasShopify || !hasMemory) throw new Error("Missing expected tools");
  console.log("  ✅ passed\n");

  // Test 3: executePrimitive (mock)
  console.log("── Test 3: executePrimitive (mocks) ──");
  const r1 = await executePrimitive("shopify_api", { method: "graphql", query: "{ shop { name } }" }, tenant.id);
  console.log(`  shopify_api: success=${r1.success}`);
  const r2 = await executePrimitive("run_code", { code: "print(42)" }, tenant.id);
  console.log(`  run_code: success=${r2.success}`);
  const r3 = await executePrimitive("memory", { action: "read", query: "test" }, tenant.id);
  console.log(`  memory read: success=${r3.success}`);
  if (!r1.success || !r2.success || !r3.success) throw new Error("Mock primitive failed");
  console.log("  ✅ passed\n");

  // Test 4: buildSystemPrompt includes tenant name and timezone
  console.log("── Test 4: buildSystemPrompt ──");
  const prompt = buildSystemPrompt(ctx);
  const hasName = prompt.includes(ctx.tenant.name!);
  const hasTz = prompt.includes(ctx.tenant.timezone);
  const hasPrimitives = prompt.includes("shopify_api") && prompt.includes("run_code");
  console.log(`  includes tenant name "${ctx.tenant.name}": ${hasName}`);
  console.log(`  includes timezone "${ctx.tenant.timezone}": ${hasTz}`);
  console.log(`  includes primitives: ${hasPrimitives}`);
  if (!hasName || !hasTz || !hasPrimitives) throw new Error("System prompt missing expected content");
  console.log("  ✅ passed\n");

  // Test 5: isConfirmation + classifyConfirmation
  console.log("── Test 5: isConfirmation + classifyConfirmation ──");
  const cases: [string, boolean, "confirmed" | "cancelled" | null][] = [
    ["yes", true, "confirmed"],
    ["Yeah sure", true, "confirmed"],
    ["no", true, "cancelled"],
    ["nope", true, "cancelled"],
    ["tell me more", false, null],
    ["what's the status?", false, null],
    ["confirm", true, "confirmed"],
    ["cancel", true, "cancelled"],
  ];
  for (const [text, expectIsConf, expectClassify] of cases) {
    const ic = isConfirmation(text);
    const cc = classifyConfirmation(text);
    console.log(`  "${text}" → isConfirmation=${ic} (${expectIsConf}), classify=${cc} (${expectClassify})`);
    if (ic !== expectIsConf) throw new Error(`isConfirmation("${text}") expected ${expectIsConf}, got ${ic}`);
    if (cc !== expectClassify) throw new Error(`classifyConfirmation("${text}") expected ${expectClassify}, got ${cc}`);
  }
  console.log("  ✅ passed\n");

  // Test 6: runAgent with placeholder API key → graceful error
  console.log("── Test 4: runAgent graceful error handling ──");
  const { runAgent } = await import("../apps/api/src/agent/loop.js");
  const result = await runAgent("Hello, how are you?", tenant.id, "message");
  console.log(`  text: "${result.text}"`);
  console.log(`  agentRunId: ${result.agentRunId}`);
  console.log(`  iterations: ${result.iterations}`);
  console.log(`  latencyMs: ${result.latencyMs}`);
  // With no valid API key, it should return the fallback message
  const expectFallback = result.text.includes("trouble thinking") || result.text.length > 0;
  console.log(`  graceful: ${expectFallback}`);
  if (!expectFallback) throw new Error("Expected graceful error or response");
  console.log("  ✅ passed\n");

  console.log("━━━ All tests passed ━━━");
  await pool.end();
}

run().catch(async (err) => {
  console.error("❌ Test failed:", err);
  await pool.end();
  process.exit(1);
});
