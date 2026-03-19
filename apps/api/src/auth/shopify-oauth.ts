import crypto from "crypto";
import { db } from "../db/connection.js";
import { stores } from "../db/schema.js";
import { encryptToken } from "./encryption.js";
import { config } from "../config.js";

export function buildShopifyInstallUrl(shop: string, state: string): string {
  const scopes = config.SHOPIFY_SCOPES;
  const redirectUri = `${config.API_URL}/auth/shopify/callback`;

  const params = new URLSearchParams({
    client_id: config.SHOPIFY_API_KEY,
    scope: scopes,
    redirect_uri: redirectUri,
    state,
    "grant_options[]": "per-user",
  });

  return `https://${shop}/admin/oauth/authorize?${params.toString()}`;
}

export function verifyShopifyHmac(
  params: Record<string, string>,
  providedHmac: string
): boolean {
  const { hmac: _, ...rest } = params;
  const message = Object.entries(rest)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

  const digest = crypto
    .createHmac("sha256", config.SHOPIFY_API_SECRET)
    .update(message)
    .digest("hex");

  return crypto.timingSafeEqual(Buffer.from(digest, "hex"), Buffer.from(providedHmac, "hex"));
}

export async function exchangeShopifyCode(
  shop: string,
  code: string
): Promise<string> {
  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: config.SHOPIFY_API_KEY,
      client_secret: config.SHOPIFY_API_SECRET,
      code,
    }),
  });

  if (!res.ok) {
    throw new Error(`Shopify token exchange failed: ${res.status}`);
  }

  const data = await res.json() as { access_token: string; scope: string };
  return data.access_token;
}

export const SHOPIFY_API_VERSION = "2024-10";

// Topics Kommand needs Shopify to push events for
const SHOPIFY_WEBHOOK_TOPICS = [
  "orders/create",
  "orders/cancelled",
  "app/uninstalled",
  "customers/data_request", // GDPR mandatory
  "customers/redact",       // GDPR mandatory
  "shop/redact",            // GDPR mandatory
] as const;

/**
 * Register all required Shopify webhook topics for a store.
 * Called once during OAuth callback after the store is saved.
 * Idempotent: Shopify returns 422 if the webhook already exists — we ignore it.
 */
export async function registerShopifyWebhooks(
  shop: string,
  accessToken: string
): Promise<void> {
  const webhookUrl = `${config.API_URL}/webhooks/shopify`;

  for (const topic of SHOPIFY_WEBHOOK_TOPICS) {
    try {
      const res = await fetch(
        `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/webhooks.json`,
        {
          method: "POST",
          headers: {
            "X-Shopify-Access-Token": accessToken,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            webhook: { topic, address: webhookUrl, format: "json" },
          }),
        }
      );

      if (!res.ok && res.status !== 422) {
        // 422 = already exists — fine. Anything else is worth logging.
        const text = await res.text();
        console.warn(
          `[shopify-oauth] Failed to register webhook "${topic}" (${res.status}): ${text}`
        );
      }
    } catch (err) {
      // Non-fatal — webhooks can be re-registered on next install
      console.warn(`[shopify-oauth] Error registering webhook "${topic}":`, err);
    }
  }
}

export async function saveShopifyStore(
  tenantId: string,
  shop: string,
  accessToken: string,
  scopes: string[]
): Promise<void> {
  const { enc, iv, tag } = encryptToken(accessToken);

  // Get store name from Shopify
  let storeName: string | null = null;
  try {
    const res = await fetch(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/shop.json`, {
      headers: { "X-Shopify-Access-Token": accessToken },
    });
    if (res.ok) {
      const data = await res.json() as { shop?: { name?: string } };
      storeName = data.shop?.name ?? null;
    }
  } catch {
    // Non-fatal
  }

  await db
    .insert(stores)
    .values({
      tenantId,
      platform: "shopify",
      domain: shop,
      name: storeName,
      accessTokenEnc: enc,
      tokenIv: iv,
      tokenTag: tag,
      scopes,
      isActive: true,
    })
    .onConflictDoUpdate({
      target: [stores.tenantId, stores.platform, stores.domain],
      set: {
        accessTokenEnc: enc,
        tokenIv: iv,
        tokenTag: tag,
        scopes,
        isActive: true,
        updatedAt: new Date(),
      },
    });
}
