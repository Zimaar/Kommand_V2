import { eq } from "drizzle-orm";
import { db } from "../db/connection.js";
import { tenants, channels } from "../db/schema.js";
import { runAgent } from "../agent/loop.js";
import { getAdapter } from "../channels/pipeline.js";

export async function runProactiveAnalysis(tenantId: string): Promise<void> {
  const tenantRows = await db
    .select({ name: tenants.name })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  const tenantName = tenantRows[0]?.name ?? "the owner";

  const analysisPrompt = `You are running a periodic business health check for ${tenantName}.

Pull the key metrics from the last 24 hours and compare against:
1. The same period last week
2. The trailing 30-day average

Look for anything notable:
- Revenue or order count significantly above or below normal (>20% variance)
- Inventory items approaching stockout (less than 5 units)
- Overdue invoices that need follow-up (if Xero connected)
- Unusual patterns (spike in returns, change in AOV, new high-value customer)
- Anything else that a good COO would flag

If you find something worth reporting, compose a concise message to the owner. Be specific with numbers.
If nothing notable, respond with exactly "NO_ALERT" and nothing else.

Store any new patterns or observations in memory for future reference.`;

  const result = await runAgent(analysisPrompt, tenantId, "proactive");

  if (result.text.includes("NO_ALERT")) {return;}

  // Find owner's WhatsApp number
  const channelRows = await db
    .select({ identifier: channels.identifier })
    .from(channels)
    .where(eq(channels.tenantId, tenantId))
    .limit(1);

  if (channelRows[0]) {
    const adapter = getAdapter("whatsapp");
    if (adapter) {
      await adapter.sendText(tenantId, channelRows[0].identifier, result.text);
    }
  }
}

export async function runMorningBrief(tenantId: string): Promise<void> {
  const tenantRows = await db
    .select({ name: tenants.name })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  const tenantName = tenantRows[0]?.name ?? "the owner";

  const briefPrompt = `Generate the morning business brief for ${tenantName}.

Pull yesterday's data and overnight activity. Include:
- Revenue and order summary vs typical day
- Any orders or payments needing attention
- Top-selling products yesterday
- Inventory alerts (anything low)
- Cash position and overdue invoices (if Xero connected)
- One thing to focus on today

Keep it under 300 words. Format for WhatsApp mobile reading. Use emoji anchors. Lead with the most important number.`;

  const result = await runAgent(briefPrompt, tenantId, "morning_brief");

  // Find owner's WhatsApp number
  const channelRows = await db
    .select({ identifier: channels.identifier })
    .from(channels)
    .where(eq(channels.tenantId, tenantId))
    .limit(1);

  if (channelRows[0]) {
    const adapter = getAdapter("whatsapp");
    if (adapter) {
      await adapter.sendText(tenantId, channelRows[0].identifier, result.text);
    }
  }
}
