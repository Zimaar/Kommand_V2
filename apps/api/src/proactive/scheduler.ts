import { Queue, Worker, type Job } from "bullmq";
import { eq } from "drizzle-orm";
import { CronExpressionParser } from "cron-parser";
import { db } from "../db/connection.js";
import { scheduledJobs } from "../db/schema.js";
import { runAgent } from "../agent/loop.js";
import { getAdapter } from "../channels/pipeline.js";
import { config } from "../config.js";
import type { AgentRunTrigger } from "@kommand/shared";

// ─── Redis connection for BullMQ ──────────────────────────────────────────────
// BullMQ requires its own ioredis instance (not the shared one).

const redisUrl = new URL(config.REDIS_URL);
const connection = {
  host: redisUrl.hostname,
  port: parseInt(redisUrl.port || "6379", 10),
  ...(redisUrl.password ? { password: decodeURIComponent(redisUrl.password) } : {}),
  ...(redisUrl.protocol === "rediss:" ? { tls: {} } : {}),
  maxRetriesPerRequest: null as null,
};

const QUEUE_NAME = "kommand-jobs";
const DLQ_NAME = "kommand-dead-letter";
const MAX_ATTEMPTS = 3;

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScheduledJobData {
  scheduledJobId: string;
  tenantId: string;
  jobType: string;
  prompt: string;
}

// Map DB jobType to AgentRunTrigger
function toTrigger(jobType: string): AgentRunTrigger {
  if (jobType === "morning_brief") return "morning_brief";
  if (jobType === "proactive_analysis") return "proactive";
  return "scheduled";
}

// ─── JobScheduler class ───────────────────────────────────────────────────────

export class JobScheduler {
  private queue: Queue;
  private deadLetterQueue: Queue;
  private worker: Worker<ScheduledJobData> | null = null;

  constructor() {
    this.queue = new Queue(QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: MAX_ATTEMPTS,
        backoff: { type: "exponential", delay: 1000 }, // 1s, 2s, 4s
        removeOnComplete: { count: 100 },
        removeOnFail: false, // keep in failed state for visibility
      },
    });

    this.deadLetterQueue = new Queue(DLQ_NAME, { connection });
  }

  /**
   * Load all active scheduled_jobs from DB, register with BullMQ, start worker.
   * Call once on server startup.
   */
  async init(): Promise<void> {
    const jobs = await db
      .select()
      .from(scheduledJobs)
      .where(eq(scheduledJobs.isActive, true));

    for (const job of jobs) {
      await this.registerJob(job);
    }

    this.worker = new Worker<ScheduledJobData>(
      QUEUE_NAME,
      (job) => this.processJob(job),
      { connection, concurrency: 5 }
    );

    this.worker.on("failed", async (job, err) => {
      console.error(`[scheduler] Job ${job?.id} (attempt ${job?.attemptsMade}/${MAX_ATTEMPTS}) failed: ${err.message}`);

      // After all retries exhausted, move to dead-letter queue
      if (job && job.attemptsMade >= MAX_ATTEMPTS) {
        await this.deadLetterQueue.add(
          "exhausted",
          {
            originalJob: job.data,
            error: err.message,
            failedAt: new Date().toISOString(),
          },
          { removeOnComplete: false, removeOnFail: false }
        );
        console.error(`[scheduler] Job ${job.id} moved to dead-letter queue after ${MAX_ATTEMPTS} attempts`);
      }
    });

    this.worker.on("error", (err) => {
      console.error("[scheduler] Worker error:", err.message);
    });

    console.log(`[scheduler] Initialized — registered ${jobs.length} active job(s)`);
  }

  /**
   * Process a single job: run the agent, send output via WhatsApp, update timestamps.
   */
  private async processJob(job: Job<ScheduledJobData>): Promise<void> {
    const { scheduledJobId, tenantId, jobType, prompt } = job.data;
    const trigger = toTrigger(jobType);

    console.log(`[scheduler] Running job ${scheduledJobId} (${jobType}) for tenant ${tenantId}`);

    const result = await runAgent(prompt, tenantId, trigger);

    // Only send if the agent produced a meaningful response
    if (!result.text.trim().includes("NO_ALERT")) {
      const adapter = getAdapter("whatsapp");
      if (adapter) {
        await adapter.sendText(tenantId, result.text);
      }
    }

    // Update last_run_at + next_run_at
    const jobRecord = await db
      .select({ cron: scheduledJobs.cron })
      .from(scheduledJobs)
      .where(eq(scheduledJobs.id, scheduledJobId))
      .limit(1);

    if (jobRecord[0]) {
      await db
        .update(scheduledJobs)
        .set({
          lastRunAt: new Date(),
          nextRunAt: calcNextRun(jobRecord[0].cron),
        })
        .where(eq(scheduledJobs.id, scheduledJobId));
    }
  }

  /**
   * Register a single DB job as a BullMQ repeatable job.
   * Safe to call multiple times — BullMQ deduplicates by jobId.
   */
  async registerJob(job: {
    id: string;
    tenantId: string;
    jobType: string;
    prompt: string;
    cron: string;
  }): Promise<void> {
    await this.queue.add(
      `sched-${job.id}`,
      {
        scheduledJobId: job.id,
        tenantId: job.tenantId,
        jobType: job.jobType,
        prompt: job.prompt,
      },
      {
        repeat: { pattern: job.cron },
        jobId: `sched-${job.id}`,
      }
    );

    // Pre-calculate and store next_run_at
    await db
      .update(scheduledJobs)
      .set({ nextRunAt: calcNextRun(job.cron) })
      .where(eq(scheduledJobs.id, job.id));
  }

  /**
   * Create morning_brief + proactive_analysis jobs for a new tenant.
   * Called during onboarding after WhatsApp is linked.
   */
  async createDefaultJobs(
    tenantId: string,
    morningBriefTime = "08:00"
  ): Promise<void> {
    const [hoursStr, minutesStr] = morningBriefTime.split(":");
    const hours = parseInt(hoursStr ?? "8", 10);
    const minutes = parseInt(minutesStr ?? "0", 10);

    // Morning brief at the tenant's chosen time
    const morningCron = `${minutes} ${hours} * * *`;

    // Proactive analysis every 6h, staggered per tenant to spread Redis load
    const staggerMin = hashToRange(tenantId, 0, 59);
    const staggerHr = hashToRange(tenantId, 0, 5);
    const proactiveCron = [
      `${staggerMin} ${staggerHr} * * *`,
      `${staggerMin} ${(staggerHr + 6) % 24} * * *`,
      `${staggerMin} ${(staggerHr + 12) % 24} * * *`,
      `${staggerMin} ${(staggerHr + 18) % 24} * * *`,
    ].join(",");
    // BullMQ cron doesn't support comma-separated hours in one expression,
    // so use "every 6 hours" offset via a single pattern.
    const proactiveCronFinal = `${staggerMin} */${6} * * *`;

    const morningPrompt = `Generate the morning business brief.

Pull yesterday's data and overnight activity. Include:
- Revenue and order summary vs typical day
- Any orders or payments needing attention
- Top-selling products yesterday
- Inventory alerts (anything low)
- Cash position and overdue invoices (if Xero connected)
- One thing to focus on today

Keep it under 300 words. Format for WhatsApp mobile reading. Use emoji anchors. Lead with the most important number.`;

    const proactivePrompt = `Run a periodic business health check.

Pull key metrics from the last 24 hours and compare against the same period last week and the trailing 30-day average.

Look for anything notable:
- Revenue or order count significantly above or below normal (>20% variance)
- Inventory items approaching stockout (less than 5 units)
- Overdue invoices that need follow-up (if Xero connected)
- Unusual patterns (spike in returns, change in AOV, new high-value customer)

If you find something worth reporting, compose a concise message with specific numbers.
If nothing notable, respond with exactly "NO_ALERT" and nothing else.

Store any new patterns or observations in memory for future reference.`;

    const inserted = await db
      .insert(scheduledJobs)
      .values([
        {
          tenantId,
          jobType: "morning_brief",
          prompt: morningPrompt,
          cron: morningCron,
          isActive: true,
        },
        {
          tenantId,
          jobType: "proactive_analysis",
          prompt: proactivePrompt,
          cron: proactiveCronFinal,
          isActive: true,
        },
      ])
      .returning();

    for (const job of inserted) {
      await this.registerJob(job);
    }

    console.log(`[scheduler] Default jobs created for tenant ${tenantId}`);
  }

  async shutdown(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
    }
    await this.queue.close();
    await this.deadLetterQueue.close();
    console.log("[scheduler] Shut down");
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcNextRun(cronExpression: string): Date {
  try {
    const interval = CronExpressionParser.parse(cronExpression);
    return interval.next().toDate();
  } catch {
    // Fallback: 6 hours from now
    return new Date(Date.now() + 6 * 60 * 60 * 1000);
  }
}

/** Deterministic hash of a string to an integer in [min, max]. */
function hashToRange(str: string, min: number, max: number): number {
  let hash = 0;
  for (const char of str) {
    hash = (hash * 31 + char.charCodeAt(0)) & 0xffffffff;
  }
  return min + (Math.abs(hash) % (max - min + 1));
}

// ─── Singleton ────────────────────────────────────────────────────────────────

export const scheduler = new JobScheduler();
