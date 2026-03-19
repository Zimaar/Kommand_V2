#!/usr/bin/env tsx
/**
 * CLI test harness — runs the agent without WhatsApp.
 * Usage: npx tsx scripts/test-agent.ts [tenantId]
 *
 * Interactive REPL: type messages, agent responds inline.
 */

import "dotenv/config";
import * as readline from "readline";
import { runAgent } from "../apps/api/src/agent/loop.js";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { tenants } from "../apps/api/src/db/schema.js";

const pool = new pg.Pool({
  connectionString: process.env["DATABASE_URL"] ?? "postgresql://postgres:postgres@localhost:5432/kommand",
});

const db = drizzle(pool);

async function getTestTenantId(): Promise<string> {
  const arg = process.argv[2];
  if (arg) return arg;

  // Find the seed tenant
  const rows = await db
    .select({ id: tenants.id, name: tenants.name })
    .from(tenants)
    .limit(1);

  const tenant = rows[0];
  if (!tenant) {
    console.error("No tenants found. Run: npx tsx scripts/seed.ts");
    process.exit(1);
  }

  console.log(`Using tenant: ${tenant.name} (${tenant.id})`);
  return tenant.id;
}

async function main() {
  const tenantId = await getTestTenantId();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log("\n=== Kommand Agent Test REPL ===");
  console.log("Type a message, press Enter. Ctrl+C to exit.\n");

  function prompt() {
    rl.question("You: ", async (input) => {
      const message = input.trim();
      if (!message) {
        prompt();
        return;
      }

      const start = Date.now();
      process.stdout.write("Kommand: thinking...");

      try {
        const response = await runAgent(message, tenantId, "message");

        // Clear the "thinking..." line
        process.stdout.clearLine(0);
        process.stdout.cursorTo(0);

        console.log(`Kommand: ${response.text}`);
        console.log(
          `\n[${response.iterations} iterations | ${response.tokensUsed} tokens | ${Date.now() - start}ms]\n`
        );
      } catch (error) {
        console.error("\nError:", error);
      }

      prompt();
    });
  }

  prompt();

  rl.on("close", async () => {
    await pool.end();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
