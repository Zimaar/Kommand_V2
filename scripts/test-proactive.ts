#!/usr/bin/env tsx
/**
 * Manually trigger proactive analysis for the test tenant.
 *
 * Usage:
 *   npx tsx scripts/test-proactive.ts
 *
 * Outcomes:
 *   - Notable data found → alert printed + sent to WhatsApp (if configured)
 *   - Nothing notable   → agent stores baselines silently, prints NO_ALERT
 */

process.env["DATABASE_URL"] ??= "postgresql://postgres:postgres@localhost:5432/kommand";
process.env["REDIS_URL"] ??= "redis://localhost:6379";
process.env["ENCRYPTION_KEY"] ??= "0".repeat(62) + "01";

import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "../apps/api/src/db/schema.js";
import { runProactiveAnalysis, PROACTIVE_ANALYSIS_PROMPT } from "../apps/api/src/proactive/scheduler.js";

const pool = new pg.Pool({ connectionString: process.env["DATABASE_URL"] });
const db = drizzle(pool, { schema });

async function run(): Promise<void> {
  console.log("── Proactive Analysis manual trigger ──\n");

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
  console.log(`\nPrompt sent to agent:\n${PROACTIVE_ANALYSIS_PROMPT}\n`);
  console.log("─".repeat(60));
  console.log("Running agent...\n");

  const startMs = Date.now();
  const output = await runProactiveAnalysis(tenant.id);
  const elapsed = Date.now() - startMs;

  console.log("─".repeat(60));
  console.log(`AGENT OUTPUT (${elapsed}ms):\n`);
  console.log(output);
  console.log("─".repeat(60));

  const isAlert = !output.includes("NO_ALERT");
  const hasWhatsApp = !!process.env["WHATSAPP_ACCESS_TOKEN"];

  console.log(`\nResult:            ${isAlert ? "⚠️  ALERT — notable data found" : "✅ NO_ALERT — baselines stored silently"}`);
  console.log(`WhatsApp delivery: ${isAlert ? (hasWhatsApp ? "✅ sent" : "⚠️  skipped (no WHATSAPP_ACCESS_TOKEN)") : "— not sent (no alert)"}`);
  console.log("\n✅ Proactive analysis triggered successfully");

  await pool.end();
}

run().catch(async (err: unknown) => {
  console.error("\n❌ Failed:", err);
  await pool.end();
  process.exit(1);
});
