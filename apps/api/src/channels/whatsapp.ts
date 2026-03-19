import crypto from "crypto";
import { config } from "../config.js";
import type { ChannelAdapter, InboundMessage } from "./types.js";
import type { WhatsAppWebhookPayload } from "@kommand/shared";

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

  async sendText(_tenantId: string, to: string, text: string): Promise<void> {
    const chunks = splitMessage(text, 4000);
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
    _tenantId: string,
    to: string,
    text: string,
    buttons: Array<{ id: string; title: string }>
  ): Promise<void> {
    await callWhatsAppApi({
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text },
        action: {
          buttons: buttons.slice(0, 3).map((b) => ({
            type: "reply",
            reply: { id: b.id, title: b.title.slice(0, 20) },
          })),
        },
      },
    });
  },

  async sendFile(
    _tenantId: string,
    to: string,
    fileUrl: string,
    filename: string,
    caption: string
  ): Promise<void> {
    await callWhatsAppApi({
      messaging_product: "whatsapp",
      to,
      type: "document",
      document: {
        link: fileUrl,
        filename,
        caption,
      },
    });
  },

  async markRead(messageId: string): Promise<void> {
    await callWhatsAppApi({
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
    });
  },
};

// ─── Internal helpers ────────────────────────────────────────────────────────

/** Ensure phone number is E.164 (+<digits>). WhatsApp sends digits only. */
function normalizeE164(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return `+${digits}`;
}

async function callWhatsAppApi(body: Record<string, unknown>): Promise<void> {
  if (!config.WHATSAPP_PHONE_NUMBER_ID || !config.WHATSAPP_ACCESS_TOKEN) {
    console.warn("[whatsapp] Missing WhatsApp config — skipping API call");
    return;
  }

  const url = `https://graph.facebook.com/v20.0/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
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
