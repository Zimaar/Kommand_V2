import { eq, and } from "drizzle-orm";
import { db } from "../db/connection.js";
import { tenants, subscriptions } from "../db/schema.js";

/**
 * Check whether a tenant has an active billing relationship (active subscription or valid trial).
 * Called before each agent run to enforce billing.
 *
 * Returns { allowed: true } or { allowed: false, reason: string }.
 */
export async function checkBilling(
  tenantId: string
): Promise<{ allowed: true } | { allowed: false; reason: string }> {
  const rows = await db
    .select({ plan: tenants.plan, planExpiresAt: tenants.planExpiresAt })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  const tenant = rows[0];
  if (!tenant) {
    return { allowed: false, reason: "Tenant not found." };
  }

  // Expired plan — no access
  if (tenant.plan === "expired") {
    return {
      allowed: false,
      reason: "Your subscription has expired. Please upgrade your plan to continue using Kommand.",
    };
  }

  // Trial — check if still within trial window
  if (tenant.plan === "trial") {
    if (tenant.planExpiresAt && new Date() > tenant.planExpiresAt) {
      // Trial has expired — update plan to expired
      await db
        .update(tenants)
        .set({ plan: "expired", updatedAt: new Date() })
        .where(eq(tenants.id, tenantId));

      return {
        allowed: false,
        reason: "Your free trial has ended. Please choose a plan to continue using Kommand.",
      };
    }
    // Still in trial
    return { allowed: true };
  }

  // Paid plan — verify there's an active subscription
  const activeSub = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.tenantId, tenantId),
        eq(subscriptions.status, "active")
      )
    )
    .limit(1);

  if (!activeSub[0]) {
    // No active subscription but plan says paid — might be stale, set to expired
    await db
      .update(tenants)
      .set({ plan: "expired", updatedAt: new Date() })
      .where(eq(tenants.id, tenantId));

    return {
      allowed: false,
      reason: "Your subscription is no longer active. Please renew to continue using Kommand.",
    };
  }

  return { allowed: true };
}
