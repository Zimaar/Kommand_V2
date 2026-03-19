import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { config } from "../config.js";
import { verifyWhatsAppSignature, whatsappAdapter } from "../channels/whatsapp.js";
import { processInboundMessage, registerAdapter } from "../channels/pipeline.js";
import {
  buildXeroAuthUrl,
  exchangeXeroCode,
  getXeroTenants,
  saveXeroConnection,
} from "../auth/xero-oauth.js";

// In-memory oauth state store for Xero (TODO M7: move to Redis)
const oauthStates = new Map<string, { tenantId: string; expiresAt: number }>();

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

  // ─── Xero OAuth ─────────────────────────────────────────────────────────────

  app.get("/xero/connect", async (req: FastifyRequest, reply: FastifyReply) => {
    const { tenant_id: tenantId } = req.query as Record<string, string>;
    if (!tenantId) {return reply.status(400).send("Missing tenant_id");}

    const state = crypto.randomUUID();
    oauthStates.set(state, { tenantId, expiresAt: Date.now() + 5 * 60 * 1000 });

    return reply.redirect(buildXeroAuthUrl(state));
  });

  app.get("/xero/callback", async (req: FastifyRequest, reply: FastifyReply) => {
    const { code, state } = req.query as Record<string, string>;

    if (!code || !state) {return reply.status(400).send("Missing code or state");}

    const stateData = oauthStates.get(state);
    if (!stateData || stateData.expiresAt < Date.now()) {
      oauthStates.delete(state);
      return reply.status(400).send("Invalid or expired state");
    }
    oauthStates.delete(state);

    const { tenantId } = stateData;

    try {
      const { accessToken, refreshToken, expiresIn } = await exchangeXeroCode(code);
      const xeroTenants = await getXeroTenants(accessToken);
      const firstOrg = xeroTenants[0];

      if (!firstOrg) {throw new Error("No Xero orgs found");}

      await saveXeroConnection(
        tenantId,
        accessToken,
        refreshToken,
        expiresIn,
        firstOrg.tenantId,
        firstOrg.tenantName
      );

      return reply.redirect(`${config.DASHBOARD_URL}/settings?connected=xero`);
    } catch (error) {
      console.error("Xero OAuth error:", error);
      return reply.redirect(`${config.DASHBOARD_URL}/settings?error=xero_oauth_failed`);
    }
  });
}
