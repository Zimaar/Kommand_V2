#!/usr/bin/env tsx
/**
 * Automated (non-interactive) pipeline test.
 * Usage: npx tsx scripts/test-pipeline-auto.ts
 */

process.env["DATABASE_URL"] ??= "postgresql://postgres:postgres@localhost:5432/kommand";
process.env["REDIS_URL"] ??= "redis://localhost:6379";
process.env["ENCRYPTION_KEY"] ??= "0".repeat(64);

import "dotenv/config";
import { registerAdapter, processInboundMessage } from "../apps/api/src/channels/pipeline.js";
import { mockAdapter } from "../apps/api/src/channels/mock-adapter.js";

registerAdapter("whatsapp", mockAdapter);

async function run(): Promise<void> {
  console.log("── Test 1: Pipeline processes a text message ──");
  await processInboundMessage("whatsapp", { text: "Hello", from: "+971501234567" });
  console.log("  ✅ passed\n");

  console.log("── Test 2: Pipeline skips empty/null messages ──");
  await processInboundMessage("whatsapp", { text: "", from: "+971501234567" });
  await processInboundMessage("whatsapp", {});
  console.log("  ✅ passed (no crash)\n");

  console.log("── Test 3: Unknown channel type is ignored ──");
  await processInboundMessage("telegram", { text: "Hello" });
  console.log("  ✅ passed\n");

  console.log("── Test 4: Mock adapter parseInbound ──");
  const parsed = mockAdapter.parseInbound({ text: "test message", from: "+123" });
  if (parsed.length === 0) {
    throw new Error("Expected parsed message");
  }
  if (parsed[0]!.text !== "test message") {
    throw new Error(`Expected "test message", got "${parsed[0]!.text}"`);
  }
  if (parsed[0]!.from !== "+123") {
    throw new Error(`Expected "+123", got "${parsed[0]!.from}"`);
  }
  console.log(`  parsed: text="${parsed[0]!.text}" from="${parsed[0]!.from}"`);
  console.log("  ✅ passed\n");

  console.log("── Test 5: Mock adapter parseInbound returns empty for empty text ──");
  const empty = mockAdapter.parseInbound({ text: "", from: "+123" });
  if (empty.length !== 0) {
    throw new Error("Expected empty array for empty text");
  }
  console.log("  ✅ passed\n");

  console.log("━━━ All pipeline tests passed ━━━");
  process.exit(0);
}

run().catch((err) => {
  console.error("❌ Pipeline test failed:", err);
  process.exit(1);
});
