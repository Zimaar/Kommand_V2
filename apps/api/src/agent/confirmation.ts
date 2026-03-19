import { eq, desc, sql, and, lt } from "drizzle-orm";
import { db } from "../db/connection.js";
import { pendingActions } from "../db/schema.js";
import { executePrimitive } from "../primitives/index.js";
import { PENDING_ACTION_EXPIRY_MINUTES } from "../config.js";
import type { PrimitiveResponse } from "@kommand/shared";

export type PendingAction = typeof pendingActions.$inferSelect;

// ─── Query ────────────────────────────────────────────────────────────────────

/** Get the most recent non-expired pending action for a tenant. */
export async function getPendingAction(tenantId: string): Promise<PendingAction | null> {
  const now = new Date();
  const rows = await db
    .select()
    .from(pendingActions)
    .where(
      and(
        eq(pendingActions.tenantId, tenantId),
        eq(pendingActions.status, "pending"),
        sql`${pendingActions.expiresAt} > ${now}`
      )
    )
    .orderBy(desc(pendingActions.createdAt))
    .limit(1);

  return rows[0] ?? null;
}

// ─── Classification ───────────────────────────────────────────────────────────

const POSITIVE = ["yes", "yeah", "yep", "confirm", "go ahead", "do it", "send it", "ok", "okay"];
const NEGATIVE = ["no", "nope", "cancel", "stop", "don't", "abort"];

/** Returns true if text is clearly a yes/no confirmation response. */
export function isConfirmation(text: string): boolean {
  const n = text.toLowerCase().trim();
  return (
    POSITIVE.some((p) => n === p || n.startsWith(p + " ")) ||
    NEGATIVE.some((p) => n === p || n.startsWith(p + " "))
  );
}

/** Returns "confirmed", "cancelled", or null (ambiguous — feed to agent). */
export function classifyConfirmation(text: string): "confirmed" | "cancelled" | null {
  const n = text.toLowerCase().trim();
  if (POSITIVE.some((p) => n === p || n.startsWith(p + " "))) {
    return "confirmed";
  }
  if (NEGATIVE.some((p) => n === p || n.startsWith(p + " "))) {
    return "cancelled";
  }
  return null;
}

// ─── Execute / Cancel ─────────────────────────────────────────────────────────

export interface ConfirmationResult {
  /** "confirmed" | "cancelled" | null (ambiguous) */
  outcome: "confirmed" | "cancelled" | null;
  /** Response text to send to the owner (null if ambiguous). */
  text: string | null;
  /** Primitive result if confirmed, undefined otherwise. */
  primitiveResult?: PrimitiveResponse;
}

/**
 * Handle a pending action based on the owner's reply.
 * - Confirmed → execute the stored primitive, update status, return result text.
 * - Cancelled → update status, return "Cancelled." text.
 * - Ambiguous → return null outcome (caller should feed to agent loop with context).
 */
export async function executePendingAction(
  action: PendingAction,
  reply: string,
  tenantId: string,
  runId?: string
): Promise<ConfirmationResult> {
  const outcome = classifyConfirmation(reply);

  if (outcome === "confirmed") {
    const result = await executePrimitive(
      action.primitiveName,
      action.primitiveInput as Record<string, unknown>,
      tenantId,
      runId
    );

    await db
      .update(pendingActions)
      .set({ status: "confirmed", resolvedAt: new Date() })
      .where(eq(pendingActions.id, action.id));

    const text = result.success
      ? `✅ Done. ${JSON.stringify(result.data).slice(0, 500)}`
      : `❌ Failed: ${result.error}`;

    return { outcome: "confirmed", text, primitiveResult: result };
  }

  if (outcome === "cancelled") {
    await db
      .update(pendingActions)
      .set({ status: "cancelled", resolvedAt: new Date() })
      .where(eq(pendingActions.id, action.id));

    return { outcome: "cancelled", text: "Got it — cancelled." };
  }

  // Ambiguous — let the agent loop handle it
  return { outcome: null, text: null };
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createPendingAction(params: {
  tenantId: string;
  agentRunId?: string;
  actionType: string;
  primitiveName: string;
  primitiveInput: Record<string, unknown>;
  previewText: string;
}): Promise<PendingAction> {
  const expiresAt = new Date(Date.now() + PENDING_ACTION_EXPIRY_MINUTES * 60 * 1000);

  const [row] = await db
    .insert(pendingActions)
    .values({
      tenantId: params.tenantId,
      agentRunId: params.agentRunId,
      actionType: params.actionType,
      primitiveName: params.primitiveName,
      primitiveInput: params.primitiveInput,
      previewText: params.previewText,
      status: "pending",
      expiresAt,
    })
    .returning();

  return row!;
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

/** Mark expired pending actions as "expired". Returns count of expired rows. */
export async function cleanupExpired(): Promise<number> {
  const now = new Date();
  const result = await db
    .update(pendingActions)
    .set({ status: "expired", resolvedAt: now })
    .where(
      and(
        eq(pendingActions.status, "pending"),
        lt(pendingActions.expiresAt, now)
      )
    )
    .returning({ id: pendingActions.id });

  return result.length;
}
