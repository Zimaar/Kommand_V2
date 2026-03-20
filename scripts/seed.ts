#!/usr/bin/env tsx
/**
 * Seed script: creates test data for local development.
 * Usage: npm run db:seed
 *
 * Creates:
 *   - Tenant: Raamiz / test@kommand.dev
 *   - Store: test-store.myshopify.com (Shopify)
 *   - WhatsApp channel: +971501234567
 *   - Morning brief scheduled job
 */

// Set dev defaults before any imports that read process.env
const DEV_ENCRYPTION_KEY = "0".repeat(62) + "01"; // 64-char hex, 32 bytes — dev only
process.env["DATABASE_URL"] ??= "postgresql://postgres:postgres@localhost:5432/kommand";
process.env["ENCRYPTION_KEY"] ??= DEV_ENCRYPTION_KEY;

import "dotenv/config";
import { createCipheriv, randomBytes } from "crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "../apps/api/src/db/schema.js";

const pool = new pg.Pool({ connectionString: process.env["DATABASE_URL"] });
const db = drizzle(pool, { schema });

// Standalone encrypt — mirrors apps/api/src/auth/encryption.ts
function encrypt(plaintext: string, keyHex: string): { enc: string; iv: string; tag: string } {
  const key = Buffer.from(keyHex, "hex");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    enc: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

async function seed(): Promise<void> {
  const encKey = process.env["ENCRYPTION_KEY"]!;
  console.log("🌱 Seeding database...\n");

  // ── Tenant ──────────────────────────────────────────────────────────────────
  const existingTenant = await db.query.tenants.findFirst({
    where: (t, { eq }) => eq(t.email, "test@kommand.dev"),
  });

  if (existingTenant) {
    console.log(`ℹ  Tenant already exists: ${existingTenant.id}`);
    console.log("   Delete it manually or run with RESEED=1 to wipe and re-seed.");
    await pool.end();
    return;
  }

  const [tenant] = await db
    .insert(schema.tenants)
    .values({
      clerkId: "clerk_dev_seed_raamiz",
      email: "test@kommand.dev",
      name: "Raamiz",
      phone: "+971501234567",
      timezone: "Asia/Dubai",
      currency: "AED",
      plan: "growth",
      preferences: {
        morningBriefTime: "08:00",
        quietHoursStart: "22:00",
        quietHoursEnd: "07:00",
      },
    })
    .returning();

  console.log(`✅ Tenant created`);
  console.log(`   ID:    ${tenant!.id}`);
  console.log(`   Email: ${tenant!.email}`);
  console.log(`   Name:  ${tenant!.name}`);
  console.log(`   Plan:  ${tenant!.plan}`);

  // ── Store ────────────────────────────────────────────────────────────────────
  const { enc, iv, tag } = encrypt("shpat_dev_dummy_token_for_local_testing", encKey);

  const [store] = await db
    .insert(schema.stores)
    .values({
      tenantId: tenant!.id,
      platform: "shopify",
      domain: "test-store.myshopify.com",
      name: "Test Store",
      accessTokenEnc: enc,
      tokenIv: iv,
      tokenTag: tag,
      scopes: [
        "read_orders",
        "write_orders",
        "read_products",
        "write_products",
        "read_inventory",
        "write_inventory",
        "read_customers",
        "read_analytics",
      ],
      isActive: true,
    })
    .returning();

  console.log(`\n✅ Store created`);
  console.log(`   ID:       ${store!.id}`);
  console.log(`   Domain:   ${store!.domain}`);
  console.log(`   Platform: ${store!.platform}`);

  // ── WhatsApp channel ─────────────────────────────────────────────────────────
  const [channel] = await db
    .insert(schema.channels)
    .values({
      tenantId: tenant!.id,
      type: "whatsapp",
      identifier: "+971501234567",
      isActive: true,
    })
    .returning();

  console.log(`\n✅ WhatsApp channel created`);
  console.log(`   ID:     ${channel!.id}`);
  console.log(`   Number: ${channel!.identifier}`);

  // ── Scheduled jobs ────────────────────────────────────────────────────────────
  const [morningBrief] = await db
    .insert(schema.scheduledJobs)
    .values({
      tenantId: tenant!.id,
      jobType: "morning_brief",
      prompt: "Generate the morning business brief.",
      cron: "0 8 * * *", // 8am daily (Asia/Dubai)
      isActive: true,
    })
    .returning();

  const [proactiveJob] = await db
    .insert(schema.scheduledJobs)
    .values({
      tenantId: tenant!.id,
      jobType: "proactive_analysis",
      prompt: "Run periodic business health check for Raamiz.",
      cron: "0 */6 * * *", // every 6 hours
      isActive: true,
    })
    .returning();

  console.log(`\n✅ Scheduled jobs created`);
  console.log(`   Morning brief: ${morningBrief!.id} (${morningBrief!.cron})`);
  console.log(`   Proactive:     ${proactiveJob!.id} (${proactiveJob!.cron})`);

  console.log("\n─────────────────────────────────────────────");
  console.log("🚀 Seed complete. Local dev ready.");
  console.log(`\n   Tenant ID:  ${tenant!.id}`);
  console.log(`   Store ID:   ${store!.id}`);
  console.log(`   WhatsApp:   +971501234567`);
  console.log(
    `\n   Test agent: npm run agent:test -- --tenant ${tenant!.id}`
  );
  console.log("─────────────────────────────────────────────\n");

  await pool.end();
}

seed().catch((err: unknown) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
