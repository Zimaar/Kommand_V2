#!/usr/bin/env tsx
/**
 * Test the job scheduler end-to-end.
 *
 * What this tests:
 *   1. JobScheduler.init() registers a DB job with BullMQ
 *   2. BullMQ fires the 1-minute cron job
 *   3. Worker calls runAgent with the stored prompt
 *   4. agent_runs row is created in the DB
 *   5. scheduled_jobs.last_run_at is updated
 *
 * Requires: Postgres + Redis running (docker compose up)
 * Usage:    npx tsx scripts/test-scheduler.ts
 */

process.env["DATABASE_URL"] ??= "postgresql://postgres:postgres@localhost:5432/kommand";
process.env["REDIS_URL"] ??= "redis://localhost:6379";
process.env["ENCRYPTION_KEY"] ??= "0".repeat(62) + "01";

import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { eq, desc } from "drizzle-orm";
import * as schema from "../apps/api/src/db/schema.js";
import { JobScheduler } from "../apps/api/src/proactive/scheduler.js";

const pool = new pg.Pool({ connectionString: process.env["DATABASE_URL"] });
const db = drizzle(pool, { schema });

const TIMEOUT_MS = 90_000; // 90s — job fires at next minute boundary (max 60s wait)
const POLL_INTERVAL_MS = 2_000;

async function run(): Promise<void> {
  console.log("── Scheduler integration test ──\n");

  // ── 1. Find the seeded tenant ──────────────────────────────────────────────
  const tenant = await db.query.tenants.findFirst({
    where: (t, { eq }) => eq(t.email, "test@kommand.dev"),
  });
  if (!tenant) {
    console.error("❌ No test tenant found. Run: npx tsx scripts/seed.ts");
    process.exit(1);
  }
  console.log(`Tenant: ${tenant.id} (${tenant.name})`);

  // ── 2. Insert a 1-minute test job ─────────────────────────────────────────
  const [testJob] = await db
    .insert(schema.scheduledJobs)
    .values({
      tenantId: tenant.id,
      jobType: "scheduled",
      prompt: "Scheduler test: respond with exactly one word: FIRED",
      cron: "* * * * *", // every minute
      isActive: true,
    })
    .returning();

  console.log(`Created test job: ${testJob!.id} (cron: ${testJob!.cron})`);

  const now = new Date();
  const nextMinute = new Date(now);
  nextMinute.setSeconds(0, 0);
  nextMinute.setMinutes(nextMinute.getMinutes() + 1);
  const waitSecs = Math.ceil((nextMinute.getTime() - now.getTime()) / 1000);
  console.log(`Current time:    ${now.toISOString()}`);
  console.log(`Next fire time:  ~${nextMinute.toISOString()} (~${waitSecs}s from now)\n`);

  // ── 3. Start scheduler ────────────────────────────────────────────────────
  console.log("Starting JobScheduler...");
  const sched = new JobScheduler();
  await sched.init();
  console.log("Scheduler running. Waiting for job to fire...\n");

  // ── 4. Poll until last_run_at is set (job fired) ──────────────────────────
  const deadline = Date.now() + TIMEOUT_MS;
  let fired = false;

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);

    const updated = await db
      .select({ lastRunAt: schema.scheduledJobs.lastRunAt, nextRunAt: schema.scheduledJobs.nextRunAt })
      .from(schema.scheduledJobs)
      .where(eq(schema.scheduledJobs.id, testJob!.id))
      .limit(1);

    if (updated[0]?.lastRunAt) {
      fired = true;
      console.log(`✅ Job fired at: ${updated[0].lastRunAt.toISOString()}`);
      console.log(`   Next run at:  ${updated[0].nextRunAt?.toISOString() ?? "(not set)"}`);
      break;
    }

    const elapsed = Math.round((Date.now() - now.getTime()) / 1000);
    process.stdout.write(`\r   Waiting... ${elapsed}s elapsed`);
  }

  if (!fired) {
    console.error(`\n❌ Job did not fire within ${TIMEOUT_MS / 1000}s`);
    await cleanup(testJob!.id, sched);
    process.exit(1);
  }

  // ── 5. Verify agent_runs record was created ───────────────────────────────
  console.log("\nChecking agent_runs...");
  await sleep(2000); // give DB write time to settle

  const agentRun = await db
    .select({
      id: schema.agentRuns.id,
      status: schema.agentRuns.status,
      trigger: schema.agentRuns.trigger,
      input: schema.agentRuns.input,
      output: schema.agentRuns.output,
      latencyMs: schema.agentRuns.latencyMs,
    })
    .from(schema.agentRuns)
    .where(eq(schema.agentRuns.tenantId, tenant.id))
    .orderBy(desc(schema.agentRuns.createdAt))
    .limit(1);

  const run = agentRun[0];
  if (!run) {
    console.error("❌ No agent_runs record found");
    await cleanup(testJob!.id, sched);
    process.exit(1);
  }

  console.log(`✅ agent_runs record created:`);
  console.log(`   run_id:   ${run.id}`);
  console.log(`   trigger:  ${run.trigger}`);
  console.log(`   status:   ${run.status}`);
  console.log(`   latency:  ${run.latencyMs}ms`);
  console.log(`   input:    "${run.input.slice(0, 60)}..."`);
  console.log(`   output:   "${(run.output ?? "(none)").slice(0, 80)}..."`);

  if (run.trigger !== "scheduled") {
    console.error(`❌ Expected trigger="scheduled", got "${run.trigger}"`);
    await cleanup(testJob!.id, sched);
    process.exit(1);
  }

  console.log("\n━━━ Scheduler test passed ━━━");
  await cleanup(testJob!.id, sched);
}

async function cleanup(jobId: string, sched: JobScheduler): Promise<void> {
  // Remove test job from DB
  await db.delete(schema.scheduledJobs).where(eq(schema.scheduledJobs.id, jobId));
  await sched.shutdown();
  await pool.end();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

run().catch(async (err: unknown) => {
  console.error("\n❌ Test failed:", err);
  await pool.end();
  process.exit(1);
});
