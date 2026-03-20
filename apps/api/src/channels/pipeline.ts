import { eq, and } from "drizzle-orm";
import { db } from "../db/connection.js";
import { channels, messages } from "../db/schema.js";
import { runAgent } from "../agent/loop.js";
import { getPendingAction } from "../agent/confirmation.js";
import { checkBilling } from "../billing/guard.js";
import { redis } from "../lib/redis.js";
import type { ChannelAdapter } from "./types.js";
import type { ChannelType } from "@kommand/shared";

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
  // 2. Deduplicate by channelMsgId (Redis SET with TTL — works across instances)
  if (await isDuplicate(parsed.channelMessageId)) {
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

  // 6. Check rate limit (Redis-backed — atomic, works across instances)
  if (!(await checkRateLimit(tenantId))) {
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
  // Check Redis cache first
  const cacheKey = `tenant:${channelType}:${identifier}`;
  const cached = await redis.get(cacheKey).catch(() => null);
  if (cached) return cached;

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

  const tenantId = rows[0]?.tenantId ?? null;

  // Cache for 5 minutes — channel→tenant mapping is stable
  if (tenantId) {
    await redis.set(cacheKey, tenantId, "EX", 300).catch(() => {});
  }

  return tenantId;
}

/**
 * Redis-backed dedup — SETNX with 1-hour TTL.
 * Returns true if this message was already processed.
 */
async function isDuplicate(channelMsgId: string): Promise<boolean> {
  try {
    // SET key value NX EX ttl — returns "OK" if set, null if key already exists
    const result = await redis.set(`dedup:${channelMsgId}`, "1", "EX", 3600, "NX");
    return result === null; // null = key existed = duplicate
  } catch {
    // Redis down — fall through (allow processing, accept potential dupe)
    return false;
  }
}

/**
 * Redis-backed rate limiting using atomic INCR + TTL windows.
 * Returns true if under both minute and hour limits.
 */
async function checkRateLimit(tenantId: string): Promise<boolean> {
  try {
    const minuteKey = `rl:${tenantId}:m:${Math.floor(Date.now() / 60000)}`;
    const hourKey = `rl:${tenantId}:h:${Math.floor(Date.now() / 3600000)}`;

    // Atomic increment + set TTL if new key (pipeline for single round-trip)
    const pipeline = redis.pipeline();
    pipeline.incr(minuteKey);
    pipeline.expire(minuteKey, 60);
    pipeline.incr(hourKey);
    pipeline.expire(hourKey, 3600);
    const results = await pipeline.exec();

    const minuteCount = (results?.[0]?.[1] as number) ?? 0;
    const hourCount = (results?.[2]?.[1] as number) ?? 0;

    return minuteCount <= RATE_LIMIT_PER_MINUTE && hourCount <= RATE_LIMIT_PER_HOUR;
  } catch {
    // Redis down — allow the request through
    return true;
  }
}
