#!/usr/bin/env tsx
/**
 * Interactive CLI to test the full message pipeline.
 * Usage: npx tsx scripts/test-pipeline.ts
 *
 * Sends messages through processInboundMessage with the mock adapter,
 * using the seeded test tenant's WhatsApp channel (+971501234567).
 */

// Set dev defaults before any imports that read process.env
process.env["DATABASE_URL"] ??= "postgresql://postgres:postgres@localhost:5432/kommand";
process.env["REDIS_URL"] ??= "redis://localhost:6379";
process.env["ENCRYPTION_KEY"] ??= "0".repeat(64);

import "dotenv/config";
import * as readline from "readline";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "../apps/api/src/db/schema.js";
import { registerAdapter, processInboundMessage } from "../apps/api/src/channels/pipeline.js";
import { mockAdapter } from "../apps/api/src/channels/mock-adapter.js";

const pool = new pg.Pool({ connectionString: process.env["DATABASE_URL"] });
const db = drizzle(pool, { schema });

async function main(): Promise<void> {
  // Find the seeded tenant
  const tenant = await db.query.tenants.findFirst({
    where: (t, { eq }) => eq(t.email, "test@kommand.dev"),
  });

  if (!tenant) {
    console.error("❌ No test tenant found. Run: npm run db:seed");
    process.exit(1);
  }

  // Find the tenant's WhatsApp channel
  const channel = await db.query.channels.findFirst({
    where: (c, { eq, and }) =>
      and(eq(c.tenantId, tenant.id), eq(c.type, "whatsapp")),
  });

  const phoneNumber = channel?.identifier ?? "+971501234567";

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  Kommand Pipeline Test CLI");
  console.log(`  Tenant: ${tenant.name} (${tenant.id})`);
  console.log(`  Channel: WhatsApp ${phoneNumber}`);
  console.log("  Type a message and press Enter. Ctrl+C to exit.");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // Register mock adapter
  registerAdapter("whatsapp", mockAdapter);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "You> ",
  });

  rl.prompt();

  rl.on("line", async (line: string) => {
    const text = line.trim();
    if (!text) {
      rl.prompt();
      return;
    }

    try {
      await processInboundMessage("whatsapp", {
        text,
        from: phoneNumber,
      });
    } catch (err) {
      console.error("❌ Pipeline error:", err instanceof Error ? err.message : err);
    }

    console.log(""); // blank line for readability
    rl.prompt();
  });

  rl.on("close", async () => {
    console.log("\n👋 Goodbye!");
    await pool.end();
    process.exit(0);
  });
}

main().catch(async (err) => {
  console.error("❌ Failed to start:", err);
  await pool.end();
  process.exit(1);
});
