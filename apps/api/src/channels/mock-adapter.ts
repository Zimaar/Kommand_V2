import type { ChannelAdapter, InboundMessage } from "./types.js";

/**
 * Mock channel adapter for local dev/testing.
 * Logs output to console instead of sending via WhatsApp.
 */
export const mockAdapter: ChannelAdapter = {
  parseInbound(raw: unknown): InboundMessage | null {
    const body = raw as Record<string, unknown>;
    const text = body?.["text"];
    const from = body?.["from"];

    if (typeof text !== "string" || !text.trim()) {
      return null;
    }

    return {
      tenantId: "", // resolved later in pipeline by channel identifier
      channelType: "whatsapp",
      channelMessageId: `mock_${Date.now()}`,
      from: typeof from === "string" ? from : "+971501234567",
      text: text.trim(),
      timestamp: new Date(),
    };
  },

  async sendText(_tenantId: string, to: string, text: string): Promise<void> {
    console.log(`\n📤 [mock → ${to}] ${text}`);
  },

  async sendButtons(
    _tenantId: string,
    to: string,
    text: string,
    buttons: Array<{ id: string; title: string }>
  ): Promise<void> {
    const btnLabels = buttons.map((b) => `[${b.title}]`).join("  ");
    console.log(`\n📤 [mock → ${to}] ${text}\n   ${btnLabels}`);
  },

  async sendFile(
    _tenantId: string,
    to: string,
    fileUrl: string,
    caption: string
  ): Promise<void> {
    console.log(`\n📤 [mock → ${to}] 📎 ${fileUrl}\n   ${caption}`);
  },
};
