import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { verifyShopifyCharge } from "../billing/shopify-billing.js";
import { createCheckoutSession, handleStripeWebhook } from "../billing/stripe-billing.js";
import { sendError, UnauthorizedError } from "../utils/errors.js";
import { config } from "../config.js";

// Middleware: resolve tenant from header (same as dashboard routes)
async function resolveTenant(req: FastifyRequest): Promise<string> {
  const tenantId = req.headers["x-tenant-id"] as string;
  if (!tenantId) {
    throw new UnauthorizedError("Missing tenant ID");
  }
  return tenantId;
}

export async function billingRoutes(app: FastifyInstance): Promise<void> {
  // ─── Shopify charge activation callback ──────────────────────────────────────
  // Shopify redirects here after merchant approves/declines the charge
  app.get(
    "/shopify/activate",
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const { tenant_id, charge_id } = req.query as {
          tenant_id?: string;
          charge_id?: string;
        };

        if (!tenant_id || !charge_id) {
          return reply.status(400).send({ error: "Missing tenant_id or charge_id" });
        }

        const result = await verifyShopifyCharge(tenant_id, charge_id);

        // Redirect merchant back to dashboard with result
        const status = result.accepted ? "success" : "declined";
        return reply.redirect(
          `${config.DASHBOARD_URL}/settings/billing?shopify=${status}&plan=${result.plan}`
        );
      } catch (error) {
        return sendError(reply, error);
      }
    }
  );

  // ─── Stripe Checkout session creation ────────────────────────────────────────
  app.post(
    "/checkout",
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const tenantId = await resolveTenant(req);
        const { plan } = req.body as { plan?: string };

        if (!plan) {
          return reply.status(400).send({ error: "Missing plan" });
        }

        const { url } = await createCheckoutSession(tenantId, plan);
        return reply.send({ url });
      } catch (error) {
        return sendError(reply, error);
      }
    }
  );

  // ─── Stripe webhook ─────────────────────────────────────────────────────────
  app.post(
    "/webhooks/stripe",
    { config: { rawBody: true } },
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const signature = req.headers["stripe-signature"] as string;
        if (!signature) {
          return reply.status(400).send({ error: "Missing Stripe signature" });
        }

        const rawBody = (req as FastifyRequest & { rawBody?: Buffer }).rawBody;
        if (!rawBody) {
          return reply.status(400).send({ error: "Missing raw body" });
        }

        await handleStripeWebhook(rawBody, signature);
        return reply.send({ received: true });
      } catch (error) {
        return sendError(reply, error);
      }
    }
  );
}
