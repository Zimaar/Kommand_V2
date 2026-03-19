#!/usr/bin/env tsx
/**
 * Seed script: creates a test tenant + channel for local development
 * Usage: npx tsx scripts/seed.ts
 */

import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { tenants, channels, scheduledJobs } from "../apps/api/src/db/schema.js";

const pool = new pg.Pool({
  connectionString: process.env["DATABASE_URL"] ?? "postgresql://postgres:postgres@localhost:5432/kommand",
});

const db = drizzle(pool);

async function seed() {
  console.log("Seeding database...");

  // Create test tenant
  const [tenant] = await db
    .insert(tenants)
    .values({
      clerkId: "clerk_test_seed",
      email: "owner@example.com",
      name: "Test Owner",
      phone: "+971501234567",
      timezone: "Asia/Dubai",
      currency: "AED",
      plan: "growth",
      preferences: {
        morningBriefTime: "08:00",
      },
    })
    .onConflictDoNothing()
    .returning();

  if (!tenant) {
    console.log("Tenant already exists, skipping.");
    await pool.end();
    return;
  }

  console.log(`Created tenant: ${tenant.id}`);

  // Link WhatsApp channel
  await db.insert(channels).values({
    tenantId: tenant.id,
    type: "whatsapp",
    identifier: "+971501234567",
    isActive: true,
  });

  // Create morning brief scheduled job
  await db.insert(scheduledJobs).values({
    tenantId: tenant.id,
    jobType: "morning_brief",
    prompt: "Generate the morning business brief",
    cron: "0 8 * * *",
    isActive: true,
  });

  console.log("Seed complete.");
  console.log(`\nTest tenant ID: ${tenant.id}`);
  console.log("WhatsApp: +971501234567");
  console.log('\nRun: npx tsx scripts/test-agent.ts to test the agent');

  await pool.end();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
