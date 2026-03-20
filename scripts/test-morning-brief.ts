#!/usr/bin/env tsx
/**
 * Manually trigger a morning brief for the test tenant.
 *
 * Usage:
 *   npx tsx scripts/test-morning-brief.ts
 *
 * What it does:
 *   1. Finds the seeded test tenant
 *   2. Calls runMorningBrief(tenantId) — same code path the scheduler uses
 *   3. Prints the brief to stdout
 *   4. Sends to WhatsApp if WHATSAPP_* env vars are configured
 *
 * In dev without a real ANTHROPIC_API_KEY the agent returns the graceful
 * fallback. Set ANTHROPIC_API_KEY + WHATSAPP_* in .env for a live test.
 */

process.env["DATABASE_URL"] ??= "postgresql://postgres:postgres@localhost:5432/kommand";
process.env["REDIS_URL"] ??= "redis://localhost:6379";
process.env["ENCRYPTION_KEY"] ??= "0".repeat(62) + "01";

import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "../apps/api/src/db/schema.js";
import { runMorningBrief, MORNING_BRIEF_PROMPT } from "../apps/api/src/proactive/scheduler.js";

const pool = new pg.Pool({ connectionString: process.env["DATABASE_URL"] });
const db = drizzle(pool, { schema });

async function run(): Promise<void> {
  console.log("── Morning Brief manual trigger ──\n");

  // Find the seeded tenant
  const tenant = await db.query.tenants.findFirst({
    where: (t, { eq }) => eq(t.email, "test@kommand.dev"),
  });

  if (!tenant) {
    console.error("❌ No test tenant found. Run: npx tsx scripts/seed.ts");
    await pool.end();
    process.exit(1);
  }

  console.log(`Tenant:   ${tenant.id} (${tenant.name})`);
  console.log(`Timezone: ${tenant.timezone}`);
  console.log(`Plan:     ${tenant.plan}`);
  console.log(`\nPrompt sent to agent:\n${MORNING_BRIEF_PROMPT}\n`);
  console.log("─".repeat(60));
  console.log("Running agent...\n");

  const startMs = Date.now();
  const brief = await runMorningBrief(tenant.id);
  const elapsed = Date.now() - startMs;

  console.log("─".repeat(60));
  console.log(`BRIEF OUTPUT (${elapsed}ms):\n`);
  console.log(brief);
  console.log("─".repeat(60));

  const hasWhatsApp = !!process.env["WHATSAPP_ACCESS_TOKEN"];
  console.log(`\nWhatsApp delivery: ${hasWhatsApp ? "✅ sent" : "⚠️  skipped (no WHATSAPP_ACCESS_TOKEN)"}`);
  console.log("\n✅ Morning brief triggered successfully");

  await pool.end();
}

run().catch(async (err: unknown) => {
  console.error("\n❌ Failed:", err);
  await pool.end();
  process.exit(1);
});
