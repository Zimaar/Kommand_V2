import { eq, and } from "drizzle-orm";
import { db } from "../db/connection.js";
import { stores, tenants, subscriptions } from "../db/schema.js";
import { decryptToken } from "../auth/encryption.js";
import { SHOPIFY_API_VERSION } from "../auth/shopify-oauth.js";
import { config, PLAN_PRICES, TRIAL_DAYS } from "../config.js";

// ─── Create recurring charge ─────────────────────────────────────────────────

/**
 * Create a Shopify recurring application charge for a tenant.
 * Returns the confirmation URL the merchant must visit to approve the charge.
 */
export async function createShopifyCharge(
  tenantId: string,
  plan: string
): Promise<{ confirmationUrl: string; chargeId: number }> {
  const pricing = PLAN_PRICES[plan];
  if (!pricing) {
    throw new Error(`Unknown plan: ${plan}`);
  }

  // Look up active Shopify store + decrypt token
  const store = await db.query.stores.findFirst({
    where: and(
      eq(stores.tenantId, tenantId),
      eq(stores.platform, "shopify"),
      eq(stores.isActive, true)
    ),
  });

  if (!store) {
    throw new Error("No active Shopify store connected");
  }

  const accessToken = decryptToken(store.accessTokenEnc, store.tokenIv, store.tokenTag);
  const returnUrl = `${config.API_URL}/billing/shopify/activate?tenant_id=${tenantId}`;

  const res = await fetch(
    `https://${store.domain}/admin/api/${SHOPIFY_API_VERSION}/recurring_application_charges.json`,
    {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        recurring_application_charge: {
          name: `Kommand ${pricing.name}`,
          price: pricing.amount,
          return_url: returnUrl,
          trial_days: TRIAL_DAYS,
          test: config.NODE_ENV !== "production" ? true : undefined,
        },
      }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify charge creation failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as {
    recurring_application_charge: {
      id: number;
      confirmation_url: string;
    };
  };

  const charge = data.recurring_application_charge;

  // Store pending subscription
  await db.insert(subscriptions).values({
    tenantId,
    provider: "shopify",
    externalId: String(charge.id),
    plan,
    status: "pending",
    trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000),
  });

  return { confirmationUrl: charge.confirmation_url, chargeId: charge.id };
}

// ─── Verify and activate charge ──────────────────────────────────────────────

/**
 * Called when Shopify redirects back after merchant approves/declines the charge.
 * For API version 2024-10, charges auto-activate on approval.
 * We verify the charge status and update our subscription record.
 */
export async function verifyShopifyCharge(
  tenantId: string,
  chargeId: string
): Promise<{ accepted: boolean; plan: string }> {
  const store = await db.query.stores.findFirst({
    where: and(
      eq(stores.tenantId, tenantId),
      eq(stores.platform, "shopify"),
      eq(stores.isActive, true)
    ),
  });

  if (!store) {
    throw new Error("No active Shopify store connected");
  }

  const accessToken = decryptToken(store.accessTokenEnc, store.tokenIv, store.tokenTag);

  const res = await fetch(
    `https://${store.domain}/admin/api/${SHOPIFY_API_VERSION}/recurring_application_charges/${chargeId}.json`,
    {
      headers: { "X-Shopify-Access-Token": accessToken },
    }
  );

  if (!res.ok) {
    throw new Error(`Failed to fetch charge ${chargeId}: ${res.status}`);
  }

  const data = (await res.json()) as {
    recurring_application_charge: {
      id: number;
      status: string;
      trial_ends_on: string | null;
    };
  };

  const charge = data.recurring_application_charge;

  // Look up our subscription record — include tenantId to prevent cross-tenant activation
  const sub = await db.query.subscriptions.findFirst({
    where: and(
      eq(subscriptions.tenantId, tenantId),
      eq(subscriptions.provider, "shopify"),
      eq(subscriptions.externalId, String(charge.id))
    ),
  });

  if (!sub) {
    throw new Error(`No subscription found for charge ${chargeId}`);
  }

  if (charge.status === "active") {
    // Merchant approved — activate subscription and update tenant plan
    const trialEnd = charge.trial_ends_on ? new Date(charge.trial_ends_on) : null;

    await db
      .update(subscriptions)
      .set({
        status: "active",
        trialEndsAt: trialEnd,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, sub.id));

    await db
      .update(tenants)
      .set({
        plan: sub.plan,
        planExpiresAt: null, // Active subscription — no expiry
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, tenantId));

    return { accepted: true, plan: sub.plan };
  }

  // Merchant declined or charge expired
  await db
    .update(subscriptions)
    .set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() })
    .where(eq(subscriptions.id, sub.id));

  return { accepted: false, plan: sub.plan };
}

// ─── Handle charge cancellation (app/uninstalled or manual cancel) ───────────

export async function cancelShopifySubscription(tenantId: string): Promise<void> {
  await db
    .update(subscriptions)
    .set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(subscriptions.tenantId, tenantId),
        eq(subscriptions.provider, "shopify"),
        eq(subscriptions.status, "active")
      )
    );

  await db
    .update(tenants)
    .set({ plan: "expired", updatedAt: new Date() })
    .where(eq(tenants.id, tenantId));
}
