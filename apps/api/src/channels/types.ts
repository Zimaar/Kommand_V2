import type { InboundMessage } from "@kommand/shared";

export type { InboundMessage, OutboundMessage, WhatsAppButton, WhatsAppMessageType } from "@kommand/shared";

export interface ChannelAdapter {
  /** Parse raw webhook/input body into InboundMessages. Returns empty array if no real messages. */
  parseInbound(raw: unknown): InboundMessage[];

  /** Send a plain text message to the tenant's registered channel. */
  sendText(tenantId: string, text: string): Promise<void>;

  /** Send a text message with up to 3 interactive buttons. Use sendList for 4–10 options. */
  sendButtons(
    tenantId: string,
    text: string,
    buttons: Array<{ id: string; title: string }>
  ): Promise<void>;

  /** Send a file (document/image) with caption. Type inferred from URL extension. */
  sendFile(tenantId: string, fileUrl: string, caption: string): Promise<void>;

  /** Send a list picker for 4–10 options (WhatsApp interactive list message). */
  sendList(
    tenantId: string,
    text: string,
    items: Array<{ id: string; title: string; description?: string }>
  ): Promise<void>;

  /** Mark a message as read (blue checkmarks). */
  markAsRead?(messageId: string): Promise<void>;
}
