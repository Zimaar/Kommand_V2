import crypto from "node:crypto";
import { eq, and } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { db } from "../db/connection.js";
import { stores, channels } from "../db/schema.js";
import { config } from "../config.js";
import { runAgent } from "../agent/loop.js";
import { whatsappAdapter } from "../channels/whatsapp.js";

// Topics Kommand actively handles — everything else is silently acked
const HANDLED_TOPICS = new Set([
  "orders/create",
  "orders/cancelled",
  "app/uninstalled",
  "customers/data_request",
  "customers/redact",
  "shop/redact",
]);

export async function shopifyWebhookRoutes(app: FastifyInstance): Promise<void> {
  // POST /webhooks/shopify
  // Shopify sends all event topics to this single endpoint.
  app.post(
    "/shopify",
    { config: { rawBody: true } },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const rawBody = (req as unknown as { rawBody: Buffer }).rawBody;
      const hmacHeader = (req.headers["x-shopify-hmac-sha256"] as string) ?? "";
      const topic = (req.headers["x-shopify-topic"] as string) ?? "";
      const shopDomain = (req.headers["x-shopify-shop-domain"] as string) ?? "";

      // 1. Verify HMAC-SHA256 signature (raw body, base64) — reject early
      if (!verifyWebhookHmac(rawBody, hmacHeader)) {
        return reply.status(401).send("Unauthorized");
      }

      // 2. Ack 200 immediately — Shopify requires a fast response
      reply.status(200).send("OK");

      // 3. Process asynchronously, don't block the response
      if (HANDLED_TOPICS.has(topic)) {
        handleWebhook(topic, shopDomain, req.body).catch((err: unknown) => {
          app.log.error(
            { err, topic, shopDomain },
            "[shopify-webhook] Async handler error"
          );
        });
      }
    }
  );
}

// ─── HMAC verification ────────────────────────────────────────────────────────
// Per SECURITY.md: HMAC-SHA256 with API secret, base64.

function verifyWebhookHmac(rawBody: Buffer, providedHmac: string): boolean {
  if (!config.SHOPIFY_API_SECRET || !providedHmac) return false;
  try {
    const digest = crypto
      .createHmac("sha256", config.SHOPIFY_API_SECRET)
      .update(rawBody)
      .digest("base64");
    return crypto.timingSafeEqual(
      Buffer.from(digest, "base64"),
      Buffer.from(providedHmac, "base64")
    );
  } catch {
    return false;
  }
}

// ─── Topic dispatch ───────────────────────────────────────────────────────────

async function handleWebhook(
  topic: string,
  shopDomain: string,
  body: unknown
): Promise<void> {
  switch (topic) {
    case "orders/create":
    case "orders/cancelled":
      await handleOrderEvent(topic, shopDomain, body);
      break;

    case "app/uninstalled":
      await handleAppUninstalled(shopDomain);
      break;

    case "customers/data_request":
    case "customers/redact":
    case "shop/redact":
      // GDPR mandatory endpoints — log for compliance, full jobs in M8
      console.log(
        `[shopify-webhook] GDPR ${topic} for ${shopDomain}:`,
        JSON.stringify(body).slice(0, 500)
      );
      break;
  }
}

// ─── orders/create · orders/cancelled ────────────────────────────────────────

async function handleOrderEvent(
  topic: string,
  shopDomain: string,
  body: unknown
): Promise<void> {
  const tenantId = await resolveTenantByShop(shopDomain);
  if (!tenantId) {
    console.warn(`[shopify-webhook] No tenant found for shop ${shopDomain}`);
    return;
  }

  // Extract order fields — don't trust the type, guard everything
  const order = (body ?? {}) as Record<string, unknown>;
  const orderName =
    typeof order.name === "string"
      ? order.name
      : `#${String(order.order_number ?? "?")}`;

  const customer = (order.customer ?? {}) as Record<string, unknown>;
  const customerName =
    [customer.first_name, customer.last_name].filter(Boolean).join(" ") ||
    (typeof customer.email === "string" ? customer.email : null) ||
    "a customer";

  const total = String(order.current_total_price ?? order.total_price ?? "?");
  const currency = typeof order.currency === "string" ? order.currency : "";

  const prompt =
    topic === "orders/cancelled"
      ? `Order ${orderName} from ${customerName} has been cancelled (value: ${total} ${currency}). Let the owner know with a brief notification.`
      : `New order just came in: ${orderName} from ${customerName} for ${total} ${currency}. Let the owner know with a brief notification. Also check if any items in this order are now low stock.`;

  await runAndNotify(prompt, tenantId);
}

// ─── app/uninstalled ──────────────────────────────────────────────────────────

async function handleAppUninstalled(shopDomain: string): Promise<void> {
  // Find the store (may already be inactive if manually disconnected)
  const store = await db.query.stores.findFirst({
    where: and(eq(stores.platform, "shopify"), eq(stores.domain, shopDomain)),
  });

  if (!store) {
    console.warn(`[shopify-webhook] app/uninstalled for unknown shop ${shopDomain}`);
    return;
  }

  // Deactivate store
  await db
    .update(stores)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(stores.id, store.id));

  const prompt = `The Kommand app has been uninstalled from the Shopify store ${shopDomain}. Let the owner know their store has been disconnected and they will need to reconnect it from the dashboard if they want to continue.`;
  await runAndNotify(prompt, store.tenantId);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function resolveTenantByShop(shopDomain: string): Promise<string | null> {
  const store = await db.query.stores.findFirst({
    where: and(
      eq(stores.platform, "shopify"),
      eq(stores.domain, shopDomain),
      eq(stores.isActive, true)
    ),
  });
  return store?.tenantId ?? null;
}

/**
 * Run a proactive agent, then deliver the response to the owner's WhatsApp.
 * Fires-and-forgets errors so callers aren't blocked.
 */
async function runAndNotify(prompt: string, tenantId: string): Promise<void> {
  const agentResponse = await runAgent(prompt, tenantId, "proactive");

  // Find the tenant's active WhatsApp channel
  const channel = await db.query.channels.findFirst({
    where: and(
      eq(channels.tenantId, tenantId),
      eq(channels.type, "whatsapp"),
      eq(channels.isActive, true)
    ),
  });

  if (!channel) {
    console.warn(
      `[shopify-webhook] No active WhatsApp channel for tenant ${tenantId} — agent ran but message not delivered`
    );
    return;
  }

  await whatsappAdapter.sendText(tenantId, channel.identifier, agentResponse.text);
}
