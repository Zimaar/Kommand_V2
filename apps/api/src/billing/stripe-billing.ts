import Stripe from "stripe";
import { eq, and } from "drizzle-orm";
import { db } from "../db/connection.js";
import { subscriptions, tenants } from "../db/schema.js";
import { config, PLAN_PRICES, TRIAL_DAYS } from "../config.js";

let _stripe: Stripe | null = null;

function getStripe(): Stripe {
  if (!_stripe) {
    if (!config.STRIPE_SECRET_KEY) {
      throw new Error("STRIPE_SECRET_KEY is not configured");
    }
    _stripe = new Stripe(config.STRIPE_SECRET_KEY);
  }
  return _stripe;
}

const STRIPE_PRICE_MAP: Record<string, string> = {
  starter: config.STRIPE_PRICE_STARTER ?? "",
  growth: config.STRIPE_PRICE_GROWTH ?? "",
  pro: config.STRIPE_PRICE_PRO ?? "",
};

// ─── Create Stripe Checkout session ──────────────────────────────────────────

export async function createCheckoutSession(
  tenantId: string,
  plan: string
): Promise<{ url: string }> {
  const stripe = getStripe();
  const pricing = PLAN_PRICES[plan];
  if (!pricing) {
    throw new Error(`Unknown plan: ${plan}`);
  }

  const priceId = STRIPE_PRICE_MAP[plan];
  if (!priceId) {
    throw new Error(`Stripe price not configured for plan: ${plan}`);
  }

  // Look up tenant email for Stripe customer
  const rows = await db
    .select({ email: tenants.email })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  const tenant = rows[0];
  if (!tenant) {
    throw new Error("Tenant not found");
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer_email: tenant.email,
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: {
      trial_period_days: TRIAL_DAYS,
      metadata: { tenantId, plan },
    },
    success_url: `${config.DASHBOARD_URL}/settings/billing?success=true`,
    cancel_url: `${config.DASHBOARD_URL}/settings/billing?cancelled=true`,
    metadata: { tenantId, plan },
  });

  if (!session.url) {
    throw new Error("Stripe did not return a checkout URL");
  }

  return { url: session.url };
}

// ─── Handle Stripe webhook events ────────────────────────────────────────────

export async function handleStripeWebhook(
  rawBody: Buffer,
  signature: string
): Promise<void> {
  const stripe = getStripe();

  if (!config.STRIPE_WEBHOOK_SECRET) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
  }

  const event = stripe.webhooks.constructEvent(
    rawBody,
    signature,
    config.STRIPE_WEBHOOK_SECRET
  );

  switch (event.type) {
    case "customer.subscription.created": {
      const sub = event.data.object as Stripe.Subscription;
      const tenantId = sub.metadata.tenantId;
      const plan = sub.metadata.plan;
      if (!tenantId || !plan) break;

      await db.insert(subscriptions).values({
        tenantId,
        provider: "stripe",
        externalId: sub.id,
        plan,
        status: sub.status === "trialing" ? "active" : "pending",
        trialEndsAt: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
      });

      if (sub.status === "active" || sub.status === "trialing") {
        await db
          .update(tenants)
          .set({ plan, planExpiresAt: null, updatedAt: new Date() })
          .where(eq(tenants.id, tenantId));
      }
      break;
    }

    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const existing = await db
        .select()
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.provider, "stripe"),
            eq(subscriptions.externalId, sub.id)
          )
        )
        .limit(1);

      if (!existing[0]) break;

      const isActive = sub.status === "active" || sub.status === "trialing";
      await db
        .update(subscriptions)
        .set({
          status: isActive ? "active" : "cancelled",
          cancelledAt: sub.canceled_at ? new Date(sub.canceled_at * 1000) : null,
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.id, existing[0].id));

      if (!isActive) {
        await db
          .update(tenants)
          .set({ plan: "expired", updatedAt: new Date() })
          .where(eq(tenants.id, existing[0].tenantId));
      }
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const existing = await db
        .select()
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.provider, "stripe"),
            eq(subscriptions.externalId, sub.id)
          )
        )
        .limit(1);

      if (!existing[0]) break;

      await db
        .update(subscriptions)
        .set({
          status: "cancelled",
          cancelledAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.id, existing[0].id));

      await db
        .update(tenants)
        .set({ plan: "expired", updatedAt: new Date() })
        .where(eq(tenants.id, existing[0].tenantId));
      break;
    }

    default:
      // Ignore unhandled event types
      break;
  }
}
