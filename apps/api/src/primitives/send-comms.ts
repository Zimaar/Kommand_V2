import { config } from "../config.js";
import { db } from "../db/connection.js";
import { pendingActions } from "../db/schema.js";
import { PENDING_ACTION_EXPIRY_MINUTES } from "../config.js";
import type { PrimitiveResponse } from "@kommand/shared";
import { SendCommsInputSchema } from "@kommand/shared";

// send_comms ALWAYS requires confirmation first.
// When called, it stores a pending_action and returns a preview.
// The actual send happens after the owner confirms.
export async function sendComms(
  input: unknown,
  tenantId: string,
  runId?: string
): Promise<PrimitiveResponse> {
  const parsed = SendCommsInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: `Invalid input: ${parsed.error.message}` };
  }

  const { channel, to, subject, body } = parsed.data;

  // Store pending action — never send without owner confirmation
  const expiresAt = new Date(Date.now() + PENDING_ACTION_EXPIRY_MINUTES * 60 * 1000);

  await db.insert(pendingActions).values({
    tenantId,
    agentRunId: runId ?? null,
    actionType: `send_${channel}`,
    primitiveName: "send_comms_execute",
    primitiveInput: { channel, to, subject, body },
    previewText: formatPreview(channel, to, subject, body),
    status: "pending",
    expiresAt,
  });

  return {
    success: true,
    data: {
      status: "awaiting_confirmation",
      preview: formatPreview(channel, to, subject, body),
      message:
        "Draft ready. Awaiting owner confirmation before sending. Show the owner the preview and ask: Send this? (Yes / No)",
    },
  };
}

// Called after owner confirms
export async function executeSendComms(
  input: unknown,
  _tenantId: string
): Promise<PrimitiveResponse> {
  const parsed = SendCommsInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: `Invalid input: ${parsed.error.message}` };
  }

  const { channel, to, subject, body } = parsed.data;

  if (channel === "whatsapp") {
    return await sendWhatsAppMessage(to, body);
  }

  return await sendEmail(to, subject ?? "Message from your business", body);
}

async function sendWhatsAppMessage(to: string, body: string): Promise<PrimitiveResponse> {
  const url = `https://graph.facebook.com/v20.0/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return { success: false, error: `WhatsApp send failed: ${err.slice(0, 500)}` };
  }

  const data = await res.json() as { messages?: Array<{ id: string }> };
  return { success: true, data: { messageId: data.messages?.[0]?.id, to } };
}

async function sendEmail(to: string, subject: string, body: string): Promise<PrimitiveResponse> {
  // TODO: integrate with Resend or SendGrid
  // For now, return not implemented
  return {
    success: false,
    error: "Email sending not yet configured. Please connect an email provider.",
  };
}

function formatPreview(channel: string, to: string, subject: string | undefined, body: string): string {
  if (channel === "email") {
    return `📧 Email to: ${to}\nSubject: ${subject ?? "(no subject)"}\n\n${body}`;
  }
  return `💬 WhatsApp to: ${to}\n\n${body}`;
}
