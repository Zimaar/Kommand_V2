import type { ChannelAdapter, InboundMessage } from "./types.js";

/**
 * Mock channel adapter for local dev/testing.
 * Logs output to console instead of sending via WhatsApp.
 */
export const mockAdapter: ChannelAdapter = {
  parseInbound(raw: unknown): InboundMessage[] {
    const body = raw as Record<string, unknown>;
    const text = body?.["text"];
    const from = body?.["from"];

    if (typeof text !== "string" || !text.trim()) {
      return [];
    }

    return [{
      tenantId: "", // resolved later in pipeline by channel identifier
      channelType: "whatsapp",
      channelMessageId: `mock_${Date.now()}`,
      from: typeof from === "string" ? from : "+971501234567",
      text: text.trim(),
      timestamp: new Date(),
    }];
  },

  async sendText(tenantId: string, text: string): Promise<void> {
    console.log(`\n[mock -> tenant:${tenantId}] ${text}`);
  },

  async sendButtons(
    tenantId: string,
    text: string,
    buttons: Array<{ id: string; title: string }>
  ): Promise<void> {
    const btnLabels = buttons.map((b) => `[${b.title}]`).join("  ");
    console.log(`\n[mock -> tenant:${tenantId}] ${text}\n   ${btnLabels}`);
  },

  async sendFile(tenantId: string, fileUrl: string, caption: string): Promise<void> {
    const filename = fileUrl.split("?")[0]?.split("/").pop() ?? "file";
    console.log(`\n[mock -> tenant:${tenantId}] file: ${filename} (${fileUrl})\n   ${caption}`);
  },

  async sendList(
    tenantId: string,
    text: string,
    items: Array<{ id: string; title: string; description?: string }>
  ): Promise<void> {
    const rows = items.map((i) => `  [${i.id}] ${i.title}${i.description ? ` — ${i.description}` : ""}`).join("\n");
    console.log(`\n[mock -> tenant:${tenantId}] ${text}\n${rows}`);
  },

  async markAsRead(messageId: string): Promise<void> {
    console.log(`[mock] marked read: ${messageId}`);
  },
};
