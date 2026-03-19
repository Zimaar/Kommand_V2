import crypto from "crypto";
import { eq, and } from "drizzle-orm";
import { db } from "../db/connection.js";
import { channels, tenants, messages } from "../db/schema.js";
import { config } from "../config.js";
import { runAgent } from "../agent/loop.js";
import type { InboundMessage, OutboundMessage } from "@kommand/shared";
import type { WhatsAppWebhookPayload } from "@kommand/shared";

export function verifyWhatsAppSignature(
  rawBody: Buffer,
  signature: string
): boolean {
  const expected = crypto
    .createHmac("sha256", config.WHATSAPP_APP_SECRET)
    .update(rawBody)
    .digest("hex");

  const provided = signature.replace("sha256=", "");
  return crypto.timingSafeEqual(
    Buffer.from(expected, "hex"),
    Buffer.from(provided, "hex")
  );
}

export async function handleInboundWhatsApp(
  payload: WhatsAppWebhookPayload
): Promise<void> {
  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      const { messages: inboundMsgs } = change.value;
      if (!inboundMsgs || inboundMsgs.length === 0) {continue;}

      for (const msg of inboundMsgs) {
        // Only handle text and button replies
        let text: string | null = null;

        if (msg.type === "text" && msg.text) {
          text = msg.text.body;
        } else if (msg.type === "interactive" && msg.interactive) {
          text =
            msg.interactive.button_reply?.title ??
            msg.interactive.list_reply?.title ??
            null;
        }

        if (!text) {continue;}

        const phoneNumber = msg.from;

        // Find tenant by WhatsApp phone number
        const channelRow = await db
          .select({ tenantId: channels.tenantId })
          .from(channels)
          .where(
            and(
              eq(channels.type, "whatsapp"),
              eq(channels.identifier, phoneNumber),
              eq(channels.isActive, true)
            )
          )
          .limit(1);

        if (!channelRow[0]) {
          // Unknown number — send onboarding message
          await sendWhatsAppText(
            phoneNumber,
            "Hi! I'm Kommand. To get started, please sign up at your Kommand dashboard and link this WhatsApp number."
          );
          continue;
        }

        const tenantId = channelRow[0].tenantId;

        // Dedup by channel_msg_id
        const existing = await db
          .select({ id: messages.id })
          .from(messages)
          .where(eq(messages.channelMsgId, msg.id))
          .limit(1);

        if (existing[0]) {continue;} // Already processed

        // Store inbound message
        await db.insert(messages).values({
          tenantId,
          direction: "inbound",
          role: "user",
          content: text,
          channelMsgId: msg.id,
        });

        // Mark as read
        await markMessageRead(msg.id);

        // Run the agent
        const response = await runAgent(text, tenantId, "message");

        // Send the response
        await sendWhatsAppText(phoneNumber, response.text);
      }
    }
  }
}

export async function sendWhatsAppText(to: string, text: string): Promise<void> {
  // WhatsApp has a 4096 char limit — split if needed
  const chunks = splitMessage(text, 4000);

  for (const chunk of chunks) {
    await sendMessage({
      to,
      type: "text",
      text: chunk,
    });
  }
}

export async function sendWhatsAppButtons(
  to: string,
  body: string,
  buttons: Array<{ id: string; title: string }>
): Promise<void> {
  const url = `https://graph.facebook.com/v20.0/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: body },
        action: {
          buttons: buttons.slice(0, 3).map((b) => ({
            type: "reply",
            reply: { id: b.id, title: b.title.slice(0, 20) },
          })),
        },
      },
    }),
  });
}

export async function sendWhatsAppDocument(
  to: string,
  documentUrl: string,
  filename: string,
  caption?: string
): Promise<void> {
  const url = `https://graph.facebook.com/v20.0/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "document",
      document: {
        link: documentUrl,
        filename,
        caption,
      },
    }),
  });
}

async function sendMessage(msg: OutboundMessage): Promise<void> {
  const url = `https://graph.facebook.com/v20.0/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  const body: Record<string, unknown> = {
    messaging_product: "whatsapp",
    to: msg.to,
    type: msg.type,
  };

  if (msg.type === "text" && msg.text) {
    body["text"] = { body: msg.text };
  }

  await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

async function markMessageRead(messageId: string): Promise<void> {
  const url = `https://graph.facebook.com/v20.0/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
    }),
  });
}

function splitMessage(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) {return [text];}

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > maxLength) {
    // Try to split at a newline
    const splitAt = remaining.lastIndexOf("\n", maxLength);
    const cutAt = splitAt > maxLength / 2 ? splitAt : maxLength;
    chunks.push(remaining.slice(0, cutAt));
    remaining = remaining.slice(cutAt).trim();
  }

  if (remaining.length > 0) {chunks.push(remaining);}
  return chunks;
}
