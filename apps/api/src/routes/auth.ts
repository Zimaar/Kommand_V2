import crypto from "node:crypto";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { redis } from "../lib/redis.js";
import { config } from "../config.js";
import {
  buildShopifyInstallUrl,
  verifyShopifyHmac,
  exchangeShopifyCode,
  saveShopifyStore,
  registerShopifyWebhooks,
} from "../auth/shopify-oauth.js";
import {
  generatePKCE,
  buildXeroAuthUrl,
  exchangeXeroCode,
  getXeroTenants,
  saveXeroConnection,
} from "../auth/xero-oauth.js";

// Nonce TTL: 5 minutes — exported so dashboard routes can share the same value
export const NONCE_TTL_SECONDS = 300;

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

      // Register Shopify webhooks — non-blocking so a registration failure
      // doesn't break the OAuth flow. Idempotent on re-install.
      registerShopifyWebhooks(shop, accessToken).catch((err: unknown) => {
        app.log.warn({ err, shop }, "Shopify webhook registration failed (non-fatal)");
      });

      return reply.redirect(
        `${config.DASHBOARD_URL}/onboarding?step=2&connected=shopify&shop=${encodeURIComponent(shop)}`
      );
    } catch (error) {
      app.log.error(error, "Shopify OAuth callback error");
      return reply.redirect(`${config.DASHBOARD_URL}/onboarding?error=shopify_oauth_failed`);
    }
  });

  // ─── Xero OAuth ─────────────────────────────────────────────────────────────
  // OAuth is initiated via POST /api/dashboard/connections/xero/initiate (authenticated).
  // There is intentionally no unauthenticated GET /auth/xero initiation route — accepting
  // an arbitrary tenant_id query param without auth would let any caller bind their
  // Xero org to another tenant's account.

  // GET /auth/xero/callback?code=&state=
  // Validates state, exchanges code with PKCE verifier, stores encrypted tokens in DB
  app.get("/xero/callback", async (req: FastifyRequest, reply: FastifyReply) => {
    const { code, state, error: oauthError } = req.query as Record<string, string>;

    if (oauthError) {
      app.log.warn({ oauthError }, "Xero OAuth denied by user");
      return reply.redirect(`${config.DASHBOARD_URL}/connections?error=xero_denied`);
    }

    if (!code || !state) {
      return reply.status(400).send({ error: "Missing code or state" });
    }

    const raw = await redis.get(`oauth:xero:${state}`);
    if (!raw) {
      return reply.status(400).send({ error: "Invalid or expired state" });
    }
    await redis.del(`oauth:xero:${state}`);

    const { tenantId, verifier } = JSON.parse(raw) as { tenantId: string; verifier: string };

    try {
      const { accessToken, refreshToken, expiresIn } = await exchangeXeroCode(code, verifier);
      const xeroTenants = await getXeroTenants(accessToken);
      const firstOrg = xeroTenants[0];

      if (!firstOrg) {
        throw new Error("No Xero organisations found on this account");
      }

      await saveXeroConnection(
        tenantId,
        accessToken,
        refreshToken,
        expiresIn,
        firstOrg.tenantId,
        firstOrg.tenantName
      );

      return reply.redirect(`${config.DASHBOARD_URL}/connections?connected=xero`);
    } catch (error) {
      app.log.error(error, "Xero OAuth callback error");
      return reply.redirect(`${config.DASHBOARD_URL}/connections?error=xero_oauth_failed`);
    }
  });
}
