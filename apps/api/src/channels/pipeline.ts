import { eq, and } from "drizzle-orm";
import { db } from "../db/connection.js";
import { channels, messages } from "../db/schema.js";
import { runAgent } from "../agent/loop.js";
import { getPendingAction } from "../agent/confirmation.js";
import { checkBilling } from "../billing/guard.js";
import type { ChannelAdapter } from "./types.js";
import type { ChannelType } from "@kommand/shared";

// In-memory dedup set (swap for Redis SET in production)
const processedMessages = new Map<string, number>();
const DEDUP_TTL_MS = 60 * 60 * 1000; // 1 hour

// In-memory rate limit counters (swap for Redis in production)
const rateLimitCounters = new Map<string, { count: number; windowStart: number }>();

const MAX_MESSAGE_LENGTH = 4000;
const RATE_LIMIT_PER_MINUTE = 10;
const RATE_LIMIT_PER_HOUR = 60;

/** Channel adapter registry. */
const adapters = new Map<string, ChannelAdapter>();

export function registerAdapter(channelType: string, adapter: ChannelAdapter): void {
  adapters.set(channelType, adapter);
}

export function getAdapter(channelType: string): ChannelAdapter | undefined {
  return adapters.get(channelType);
}

/**
 * Full message processing pipeline:
 * 1. Parse → 2. Dedup → 3. Resolve tenant → 4. Truncate → 5. Store inbound
 * → 6. Rate limit → 7. Run agent → 8. Store outbound → 9. Send response → 10. Mark read
 */
export async function processInboundMessage(
  channelType: string,
  rawBody: unknown
): Promise<void> {
  const adapter = adapters.get(channelType);
  if (!adapter) {
    console.warn(`[pipeline] No adapter registered for channel type: ${channelType}`);
    return;
  }

  // 1. Parse via channel adapter — may return multiple messages (batch webhook)
  const parsedMessages = adapter.parseInbound(rawBody);
  if (parsedMessages.length === 0) {
    return; // Not a real message (e.g., status update)
  }

  // Process each message in the batch
  for (const parsed of parsedMessages) {
    await processSingleMessage(adapter, channelType, parsed);
  }
}

async function processSingleMessage(
  adapter: ChannelAdapter,
  channelType: string,
  parsed: import("@kommand/shared").InboundMessage
): Promise<void> {
  // 2. Deduplicate by channelMsgId
  if (isDuplicate(parsed.channelMessageId)) {
    console.log(`[pipeline] Duplicate message: ${parsed.channelMessageId}`);
    return;
  }

  // 3. Look up tenant by channel identifier
  const tenantId = await resolveTenant(channelType as ChannelType, parsed.from);
  if (!tenantId) {
    if (adapter.notifyUnlinked) {
      await adapter.notifyUnlinked(parsed.from).catch((err) => {
        console.warn(`[pipeline] Failed to notify unlinked sender: ${err}`);
      });
    }
    return;
  }

  // 4. Truncate message
  const text = parsed.text.slice(0, MAX_MESSAGE_LENGTH);

  // 5. Store inbound message in DB
  await db.insert(messages).values({
    tenantId,
    direction: "inbound",
    role: "user",
    content: text,
    channelMsgId: parsed.channelMessageId,
  });

  // 6. Check rate limit
  if (!checkRateLimit(tenantId)) {
    await adapter.sendText(
      tenantId,
      "You're sending messages too fast. Please wait a moment and try again."
    );
    return;
  }

  // 6b. Check billing — active subscription or valid trial required
  const billing = await checkBilling(tenantId);
  if (!billing.allowed) {
    await adapter.sendText(tenantId, billing.reason);
    return;
  }

  // 7. Run agent
  const response = await runAgent(text, tenantId, "message");

  // 8. Store outbound message is handled inside runAgent (finalizeRun)
  // — it inserts the assistant message into messages table

  // 9. Send response via channel adapter
  const pending = await getPendingAction(tenantId);

  if (pending) {
    // Pending action → send with confirmation buttons
    await adapter.sendButtons(tenantId, response.text, [
      { id: "confirm_yes", title: "Yes" },
      { id: "confirm_no", title: "No" },
    ]);
  } else {
    // Plain text
    await adapter.sendText(tenantId, response.text);
  }

  // Send any generated files as document/image attachments
  if (response.files && response.files.length > 0) {
    for (const file of response.files) {
      if (!file.url) continue; // dev mode — no URL
      await adapter.sendFile(tenantId, file.url, file.filename).catch((err) => {
        console.error(`[pipeline] Failed to send file "${file.filename}":`, err);
      });
    }
  }

  // 10. Mark read
  if (adapter.markAsRead) {
    adapter.markAsRead(parsed.channelMessageId).catch((err) => {
      console.warn(`[pipeline] Failed to mark message read: ${err}`);
    });
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function resolveTenant(
  channelType: ChannelType,
  identifier: string
): Promise<string | null> {
  const rows = await db
    .select({ tenantId: channels.tenantId })
    .from(channels)
    .where(
      and(
        eq(channels.type, channelType),
        eq(channels.identifier, identifier),
        eq(channels.isActive, true)
      )
    )
    .limit(1);

  return rows[0]?.tenantId ?? null;
}

function isDuplicate(channelMsgId: string): boolean {
  const now = Date.now();

  // Cleanup old entries periodically
  if (processedMessages.size > 1000) {
    for (const [key, timestamp] of processedMessages) {
      if (now - timestamp > DEDUP_TTL_MS) {
        processedMessages.delete(key);
      }
    }
  }

  if (processedMessages.has(channelMsgId)) {
    return true;
  }

  processedMessages.set(channelMsgId, now);
  return false;
}

function checkRateLimit(tenantId: string): boolean {
  const now = Math.floor(Date.now() / 1000);
  const minuteKey = `${tenantId}:minute`;
  const hourKey = `${tenantId}:hour`;

  // Check both limits before incrementing either
  const minuteCounter = rateLimitCounters.get(minuteKey);
  const minuteActive = minuteCounter && now - minuteCounter.windowStart < 60;
  if (minuteActive && minuteCounter.count >= RATE_LIMIT_PER_MINUTE) {
    return false;
  }

  const hourCounter = rateLimitCounters.get(hourKey);
  const hourActive = hourCounter && now - hourCounter.windowStart < 3600;
  if (hourActive && hourCounter.count >= RATE_LIMIT_PER_HOUR) {
    return false;
  }

  // Increment only after both checks pass
  if (minuteActive) {
    minuteCounter.count++;
  } else {
    rateLimitCounters.set(minuteKey, { count: 1, windowStart: now });
  }

  if (hourActive) {
    hourCounter.count++;
  } else {
    rateLimitCounters.set(hourKey, { count: 1, windowStart: now });
  }

  return true;
}
