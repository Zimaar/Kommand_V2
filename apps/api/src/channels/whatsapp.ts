import crypto from "crypto";
import { eq, and } from "drizzle-orm";
import { config } from "../config.js";
import { db } from "../db/connection.js";
import { channels } from "../db/schema.js";
import type { ChannelAdapter, InboundMessage } from "./types.js";
import type { WhatsAppWebhookPayload } from "@kommand/shared";
import { formatForWhatsApp, fileUrlToFilename } from "./channel-utils.js";

const LIST_BUTTON_LABEL = "Choose…";

// ─── Signature verification ──────────────────────────────────────────────────

export function verifyWhatsAppSignature(
  rawBody: Buffer,
  signature: string
): boolean {
  if (!config.WHATSAPP_APP_SECRET) {
    return false;
  }
  try {
    const expected = crypto
      .createHmac("sha256", config.WHATSAPP_APP_SECRET)
      .update(rawBody)
      .digest("hex");

    const provided = signature.replace("sha256=", "");
    return crypto.timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(provided, "hex")
    );
  } catch {
    return false;
  }
}

// ─── WhatsApp Channel Adapter ────────────────────────────────────────────────

export const whatsappAdapter: ChannelAdapter = {
  parseInbound(raw: unknown): InboundMessage[] {
    const payload = raw as WhatsAppWebhookPayload;
    if (!payload?.entry) {
      return [];
    }

    const results: InboundMessage[] = [];

    for (const entry of payload.entry) {
      for (const change of entry.changes) {
        const msgs = change.value.messages;
        if (!msgs || msgs.length === 0) {
          continue;
        }

        for (const msg of msgs) {
          let text: string | null = null;

          if (msg.type === "text" && msg.text) {
            text = msg.text.body;
          } else if (msg.type === "interactive" && msg.interactive) {
            text =
              msg.interactive.button_reply?.id ??
              msg.interactive.list_reply?.id ??
              null;
          }

          if (!text) {
            continue;
          }

          results.push({
            tenantId: "", // resolved in pipeline
            channelType: "whatsapp",
            channelMessageId: msg.id,
            from: normalizeE164(msg.from),
            text,
            timestamp: new Date(Number(msg.timestamp) * 1000),
          });
        }
      }
    }

    return results;
  },

  async sendText(tenantId: string, text: string): Promise<void> {
    const to = await resolveOwnerPhone(tenantId);
    if (!to) return;
    const formatted = formatForWhatsApp(text);
    const chunks = splitMessage(formatted, 4096);
    for (const chunk of chunks) {
      await callWhatsAppApi({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: chunk },
      });
    }
  },

  async sendButtons(
    tenantId: string,
    text: string,
    buttons: Array<{ id: string; title: string }>
  ): Promise<void> {
    const to = await resolveOwnerPhone(tenantId);
    if (!to) return;

    // WhatsApp allows max 3 buttons; fall back to list for larger sets
    if (buttons.length > 3) {
      return sendListInteractive(to, text, buttons.map((b) => ({ id: b.id, title: b.title })));
    }

    await callWhatsAppApi({
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: formatForWhatsApp(text) },
        action: {
          buttons: buttons.map((b) => ({
            type: "reply",
            reply: { id: b.id, title: b.title.slice(0, 20) },
          })),
        },
      },
    });
  },

  async sendFile(tenantId: string, fileUrl: string, caption: string): Promise<void> {
    const to = await resolveOwnerPhone(tenantId);
    if (!to) return;

    const ext = fileUrl.split("?")[0]?.split(".").pop()?.toLowerCase() ?? "";
    const isImage = ext === "png" || ext === "jpg" || ext === "jpeg" || ext === "gif" || ext === "webp";

    if (isImage) {
      await callWhatsAppApi({
        messaging_product: "whatsapp",
        to,
        type: "image",
        image: { link: fileUrl, caption },
      });
    } else {
      await callWhatsAppApi({
        messaging_product: "whatsapp",
        to,
        type: "document",
        document: { link: fileUrl, filename: fileUrlToFilename(fileUrl), caption },
      });
    }
  },

  async sendList(
    tenantId: string,
    text: string,
    items: Array<{ id: string; title: string; description?: string }>
  ): Promise<void> {
    const to = await resolveOwnerPhone(tenantId);
    if (!to) return;
    return sendListInteractive(to, text, items);
  },

  async markAsRead(messageId: string): Promise<void> {
    await callWhatsAppApi({
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
    });
  },

  async notifyUnlinked(from: string): Promise<void> {
    await sendTextToPhone(
      from,
      "This number isn't linked to a Kommand account. Set up at kommand.dev"
    );
  },
};

// ─── Internal helpers ────────────────────────────────────────────────────────

/** Send a WhatsApp interactive list message. Shared by sendList and the sendButtons fallback. */
async function sendListInteractive(
  to: string,
  text: string,
  items: Array<{ id: string; title: string; description?: string }>
): Promise<void> {
  await callWhatsAppApi({
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: formatForWhatsApp(text) },
      action: {
        button: LIST_BUTTON_LABEL,
        sections: [
          {
            title: "Options",
            rows: items.slice(0, 10).map((item) => ({
              id: item.id,
              title: item.title.slice(0, 24),
              ...(item.description ? { description: item.description.slice(0, 72) } : {}),
            })),
          },
        ],
      },
    },
  });
}

/** Ensure phone number is E.164 (+<digits>). WhatsApp sends digits only. */
function normalizeE164(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return `+${digits}`;
}

/** Look up the tenant's registered WhatsApp phone number from the channels table. */
async function resolveOwnerPhone(tenantId: string): Promise<string | null> {
  const rows = await db
    .select({ identifier: channels.identifier })
    .from(channels)
    .where(
      and(
        eq(channels.tenantId, tenantId),
        eq(channels.type, "whatsapp"),
        eq(channels.isActive, true)
      )
    )
    .limit(1);

  const phone = rows[0]?.identifier ?? null;
  if (!phone) {
    console.warn(`[whatsapp] No active WhatsApp channel for tenant ${tenantId}`);
  }
  return phone;
}

/** Send a plain text message directly to a phone number (no tenant lookup). */
export async function sendTextToPhone(to: string, text: string): Promise<void> {
  await callWhatsAppApi({
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body: text },
  });
}

async function callWhatsAppApi(body: Record<string, unknown>): Promise<void> {
  if (!config.WHATSAPP_PHONE_NUMBER_ID || !config.WHATSAPP_ACCESS_TOKEN) {
    console.warn("[whatsapp] Missing WhatsApp config — skipping API call");
    return;
  }

  const url = `https://graph.facebook.com/v21.0/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error(`[whatsapp] API error ${res.status}: ${detail}`);
  }
}

function splitMessage(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > maxLength) {
    const splitAt = remaining.lastIndexOf("\n", maxLength);
    const cutAt = splitAt > maxLength / 2 ? splitAt : maxLength;
    chunks.push(remaining.slice(0, cutAt));
    remaining = remaining.slice(cutAt).trim();
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }
  return chunks;
}
