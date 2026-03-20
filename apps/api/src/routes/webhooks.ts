import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { config } from "../config.js";
import { verifyWhatsAppSignature, whatsappAdapter } from "../channels/whatsapp.js";
import { processInboundMessage, registerAdapter } from "../channels/pipeline.js";

// Register channel adapters
registerAdapter("whatsapp", whatsappAdapter);

export async function webhookRoutes(app: FastifyInstance): Promise<void> {
  // ─── WhatsApp ───────────────────────────────────────────────────────────────

  // Webhook verification (GET)
  app.get("/whatsapp", async (req: FastifyRequest, reply: FastifyReply) => {
    const { "hub.mode": mode, "hub.verify_token": token, "hub.challenge": challenge } =
      req.query as Record<string, string>;

    if (mode === "subscribe" && token === config.WHATSAPP_VERIFY_TOKEN) {
      return reply.send(challenge);
    }
    return reply.status(403).send("Forbidden");
  });

  // Inbound messages (POST)
  app.post(
    "/whatsapp",
    { config: { rawBody: true } },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const signature = (req.headers["x-hub-signature-256"] as string) ?? "";
      const rawBody = (req as unknown as { rawBody: Buffer }).rawBody;

      if (!verifyWhatsAppSignature(rawBody, signature)) {
        return reply.status(401).send("Invalid signature");
      }

      // Respond 200 immediately — WhatsApp requires fast acks
      reply.status(200).send("OK");

      // Process asynchronously via pipeline
      processInboundMessage("whatsapp", req.body).catch((err) => {
        console.error("WhatsApp message processing error:", err);
      });
    }
  );

}
