import type { PrimitiveResponse } from "@kommand/shared";
import type { PrimitiveDefinition } from "./types.js";
import { SendCommsInputSchema } from "@kommand/shared";

export const sendCommsDef: PrimitiveDefinition = {
  name: "send_comms",
  description:
    "Send a message to someone on the owner's behalf. This could be a WhatsApp message to a customer, an email to a supplier, or an invoice reminder. IMPORTANT: You MUST show the owner a preview of the message and get their explicit confirmation before calling this primitive. Never send without approval. This call will store the draft and prompt for confirmation.",
  inputSchema: {
    type: "object",
    properties: {
      channel: {
        type: "string",
        enum: ["whatsapp", "email"],
      },
      to: {
        type: "string",
        description: "Phone number (E.164) for WhatsApp, email address for email.",
      },
      subject: {
        type: "string",
        description: "Email subject line. Not used for WhatsApp.",
      },
      body: {
        type: "string",
        description: "Message body.",
      },
    },
    required: ["channel", "to", "body"],
  },
  handler: sendComms,
};

// Mock — real implementation in M3
async function sendComms(input: unknown, _tenantId: string): Promise<PrimitiveResponse> {
  const parsed = SendCommsInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: `Invalid input: ${parsed.error.message}` };
  }

  return {
    success: true,
    data: {
      status: "draft_created",
      message: `Draft ${parsed.data.channel} message to ${parsed.data.to} created. Awaiting owner confirmation.`,
    },
  };
}
