import type { InboundMessage } from "@kommand/shared";

export type { InboundMessage, OutboundMessage, WhatsAppButton, WhatsAppMessageType } from "@kommand/shared";

export interface ChannelAdapter {
  /** Parse raw webhook/input body into InboundMessages. Returns empty array if no real messages. */
  parseInbound(raw: unknown): InboundMessage[];

  /** Send a plain text message to the tenant's channel. */
  sendText(tenantId: string, to: string, text: string): Promise<void>;

  /** Send a text message with interactive buttons (e.g., Yes/No confirmation). */
  sendButtons(
    tenantId: string,
    to: string,
    text: string,
    buttons: Array<{ id: string; title: string }>
  ): Promise<void>;

  /** Send a file (document/image) with optional caption. */
  sendFile(tenantId: string, to: string, fileUrl: string, filename: string, caption: string): Promise<void>;

  /** Mark a message as read (e.g., WhatsApp read receipts). */
  markRead?(messageId: string): Promise<void>;
}
