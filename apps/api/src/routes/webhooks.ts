import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { config } from "../config.js";
import {
  verifyWhatsAppSignature,
  handleInboundWhatsApp,
} from "../channels/whatsapp.js";
import {
  verifyShopifyHmac,
  exchangeShopifyCode,
  saveShopifyStore,
} from "../auth/shopify-oauth.js";
import {
  exchangeXeroCode,
  getXeroTenants,
  saveXeroConnection,
} from "../auth/xero-oauth.js";
import { eq } from "drizzle-orm";
import { db } from "../db/connection.js";
import { tenants } from "../db/schema.js";
import type { WhatsAppWebhookPayload } from "@kommand/shared";

// In-memory nonce store (use Redis in production)
const usedNonces = new Set<string>();
const oauthStates = new Map<string, { tenantId: string; expiresAt: number }>();

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

      // Process asynchronously
      handleInboundWhatsApp(req.body as WhatsAppWebhookPayload).catch((err) => {
        console.error("WhatsApp message processing error:", err);
      });
    }
  );

  // ─── Shopify OAuth ──────────────────────────────────────────────────────────

  // Initiate OAuth (redirects to Shopify)
  app.get("/shopify/install", async (req: FastifyRequest, reply: FastifyReply) => {
    const { shop, tenant_id: tenantId } = req.query as Record<string, string>;

    if (!shop || !tenantId) {
      return reply.status(400).send("Missing shop or tenant_id");
    }

    const state = crypto.randomUUID();
    oauthStates.set(state, { tenantId, expiresAt: Date.now() + 5 * 60 * 1000 });

    const redirectUrl = buildShopifyInstallUrl(shop, state);
    return reply.redirect(redirectUrl);
  });

  // OAuth callback
  app.get("/shopify/callback", async (req: FastifyRequest, reply: FastifyReply) => {
    const params = req.query as Record<string, string>;
    const { shop, code, state, hmac, timestamp } = params;

    if (!shop || !code || !state || !hmac || !timestamp) {
      return reply.status(400).send("Missing required params");
    }

    // Verify HMAC
    if (!verifyShopifyHmac(params, hmac)) {
      return reply.status(401).send("Invalid HMAC");
    }

    // Verify state
    const stateData = oauthStates.get(state);
    if (!stateData || stateData.expiresAt < Date.now()) {
      oauthStates.delete(state);
      return reply.status(400).send("Invalid or expired state");
    }
    oauthStates.delete(state);

    const { tenantId } = stateData;

    try {
      const accessToken = await exchangeShopifyCode(shop, code);
      const scopes = config.SHOPIFY_SCOPES.split(",");
      await saveShopifyStore(tenantId, shop, accessToken, scopes);

      return reply.redirect(`${config.DASHBOARD_URL}/onboarding?step=whatsapp&connected=shopify`);
    } catch (error) {
      console.error("Shopify OAuth error:", error);
      return reply.redirect(`${config.DASHBOARD_URL}/onboarding?error=shopify_oauth_failed`);
    }
  });

  // ─── Xero OAuth ─────────────────────────────────────────────────────────────

  app.get("/xero/connect", async (req: FastifyRequest, reply: FastifyReply) => {
    const { tenant_id: tenantId } = req.query as Record<string, string>;
    if (!tenantId) return reply.status(400).send("Missing tenant_id");

    const state = crypto.randomUUID();
    oauthStates.set(state, { tenantId, expiresAt: Date.now() + 5 * 60 * 1000 });

    const { buildXeroAuthUrl } = await import("../auth/xero-oauth.js");
    return reply.redirect(buildXeroAuthUrl(state));
  });

  app.get("/xero/callback", async (req: FastifyRequest, reply: FastifyReply) => {
    const { code, state } = req.query as Record<string, string>;

    if (!code || !state) return reply.status(400).send("Missing code or state");

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

      if (!firstOrg) throw new Error("No Xero orgs found");

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

function buildShopifyInstallUrl(shop: string, state: string): string {
  const { buildShopifyInstallUrl: build } = require("../auth/shopify-oauth.js");
  return build(shop, state);
}
