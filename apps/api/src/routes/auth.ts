import crypto from "node:crypto";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { redis } from "../lib/redis.js";
import { config } from "../config.js";
import {
  buildShopifyInstallUrl,
  verifyShopifyHmac,
  exchangeShopifyCode,
  saveShopifyStore,
} from "../auth/shopify-oauth.js";

// Nonce TTL: 5 minutes
const NONCE_TTL_SECONDS = 300;

function nonceKey(state: string): string {
  return `oauth:nonce:${state}`;
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // ─── Shopify OAuth ──────────────────────────────────────────────────────────

  // GET /auth/shopify?shop={domain}&tenant_id={id}
  // Generates OAuth URL, stores nonce in Redis, redirects to Shopify
  app.get("/shopify", async (req: FastifyRequest, reply: FastifyReply) => {
    const { shop, tenant_id: tenantId } = req.query as Record<string, string>;

    if (!shop || !tenantId) {
      return reply.status(400).send({ error: "Missing shop or tenant_id" });
    }

    // Validate shop domain format
    if (!/^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(shop)) {
      return reply.status(400).send({ error: "Invalid shop domain" });
    }

    const state = crypto.randomUUID();
    await redis.set(nonceKey(state), tenantId, "EX", NONCE_TTL_SECONDS);

    const redirectUrl = buildShopifyInstallUrl(shop, state);
    return reply.redirect(redirectUrl);
  });

  // GET /auth/shopify/callback?shop=&code=&state=&hmac=&timestamp=
  // Validates nonce, exchanges code for token, encrypts and stores in DB
  app.get("/shopify/callback", async (req: FastifyRequest, reply: FastifyReply) => {
    const params = req.query as Record<string, string>;
    const { shop, code, state, hmac, timestamp } = params;

    if (!shop || !code || !state || !hmac || !timestamp) {
      return reply.status(400).send({ error: "Missing required params" });
    }

    // Verify HMAC signature
    if (!verifyShopifyHmac(params, hmac)) {
      return reply.status(401).send({ error: "Invalid HMAC" });
    }

    // Retrieve and validate nonce from Redis
    const tenantId = await redis.get(nonceKey(state));
    if (!tenantId) {
      return reply.status(400).send({ error: "Invalid or expired state" });
    }
    await redis.del(nonceKey(state));

    try {
      const accessToken = await exchangeShopifyCode(shop, code);
      const scopes = config.SHOPIFY_SCOPES.split(",");
      await saveShopifyStore(tenantId, shop, accessToken, scopes);

      return reply.redirect(`${config.DASHBOARD_URL}/onboarding?step=whatsapp&connected=shopify`);
    } catch (error) {
      app.log.error(error, "Shopify OAuth callback error");
      return reply.redirect(`${config.DASHBOARD_URL}/onboarding?error=shopify_oauth_failed`);
    }
  });
}
