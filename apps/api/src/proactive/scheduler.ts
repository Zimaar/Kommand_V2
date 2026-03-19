import { Queue, Worker, type Job } from "bullmq";
import { eq, lte, and } from "drizzle-orm";
import { db } from "../db/connection.js";
import { tenants, scheduledJobs } from "../db/schema.js";
import { runProactiveAnalysis, runMorningBrief } from "./analysis.js";
import { config } from "../config.js";

// Parse REDIS_URL into a plain options object so BullMQ uses its own bundled
// ioredis — avoids the dual-ioredis type conflict under exactOptionalPropertyTypes.
const redisUrl = new URL(config.REDIS_URL);
const connection = {
  host: redisUrl.hostname,
  port: parseInt(redisUrl.port || "6379", 10),
  ...(redisUrl.password ? { password: decodeURIComponent(redisUrl.password) } : {}),
  ...(redisUrl.protocol === "rediss:" ? { tls: {} } : {}),
  maxRetriesPerRequest: null as null,
};

// Queues
export const proactiveQueue = new Queue("proactive-analysis", { connection });
export const morningBriefQueue = new Queue("morning-brief", { connection });

// Workers
const proactiveWorker = new Worker(
  "proactive-analysis",
  async (job: Job<{ tenantId: string }>) => {
    await runProactiveAnalysis(job.data.tenantId);
  },
  { connection, concurrency: 10 }
);

const morningBriefWorker = new Worker(
  "morning-brief",
  async (job: Job<{ tenantId: string }>) => {
    await runMorningBrief(job.data.tenantId);
  },
  { connection, concurrency: 5 }
);

proactiveWorker.on("failed", (job, err) => {
  console.error(`Proactive analysis failed for job ${job?.id}:`, err);
});

morningBriefWorker.on("failed", (job, err) => {
  console.error(`Morning brief failed for job ${job?.id}:`, err);
});

// Schedule proactive analysis every 6 hours for all active Growth/Pro tenants
export async function scheduleProactiveRuns(): Promise<void> {
  const activeTenants = await db
    .select({ id: tenants.id, plan: tenants.plan })
    .from(tenants)
    .where(and());

  for (const tenant of activeTenants) {
    if (!["growth", "pro"].includes(tenant.plan)) {continue;}

    await proactiveQueue.add(
      "analyze",
      { tenantId: tenant.id },
      {
        repeat: { every: 6 * 60 * 60 * 1000 }, // every 6 hours
        jobId: `proactive-${tenant.id}`,
      }
    );
  }
}

// Schedule morning briefs based on each tenant's preferred time
export async function scheduleMorningBriefs(): Promise<void> {
  const activeTenants = await db
    .select({ id: tenants.id, preferences: tenants.preferences, timezone: tenants.timezone })
    .from(tenants);

  for (const tenant of activeTenants) {
    const prefs = (tenant.preferences as Record<string, unknown>) ?? {};
    const briefTime = (prefs["morningBriefTime"] as string) ?? "08:00";
    const [hours, minutes] = briefTime.split(":").map(Number);

    // Convert to UTC cron (simplified — production should use timezone-aware scheduling)
    await morningBriefQueue.add(
      "brief",
      { tenantId: tenant.id },
      {
        repeat: { pattern: `${minutes ?? 0} ${hours ?? 8} * * *` },
        jobId: `morning-brief-${tenant.id}`,
      }
    );
  }
}

export async function initScheduler(): Promise<void> {
  await scheduleProactiveRuns();
  await scheduleMorningBriefs();
  console.log("Scheduler initialized");
}
