import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { eq, desc, and } from "drizzle-orm";
import { db } from "../db/connection.js";
import {
  tenants,
  stores,
  accountingConnections,
  channels,
  agentRuns,
  messages,
} from "../db/schema.js";
import { UpdatePreferencesSchema } from "@kommand/shared";
import { sendError, UnauthorizedError, NotFoundError } from "../utils/errors.js";
import { sendTextToPhone } from "../channels/whatsapp.js";

// Middleware: resolve tenant from Clerk JWT
async function resolveTenant(req: FastifyRequest): Promise<string> {
  // In production: verify Clerk JWT from Authorization header
  // For now: read tenant_id from header (replace with proper Clerk verification)
  const tenantId = req.headers["x-tenant-id"] as string;
  if (!tenantId) {throw new UnauthorizedError("Missing tenant ID");}
  return tenantId;
}

export async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/dashboard/me — current tenant info
  app.get("/me", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = await resolveTenant(req);
      const rows = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);

      const tenant = rows[0];
      if (!tenant) {throw new NotFoundError("Tenant");}

      const storeRows = await db
        .select()
        .from(stores)
        .where(eq(stores.tenantId, tenantId));

      const connRows = await db
        .select()
        .from(accountingConnections)
        .where(eq(accountingConnections.tenantId, tenantId));

      const channelRows = await db
        .select()
        .from(channels)
        .where(eq(channels.tenantId, tenantId));

      return reply.send({
        id: tenant.id,
        name: tenant.name,
        email: tenant.email,
        phone: tenant.phone,
        timezone: tenant.timezone,
        currency: tenant.currency,
        plan: tenant.plan,
        preferences: tenant.preferences,
        stores: storeRows.map((s) => ({
          id: s.id,
          platform: s.platform,
          domain: s.domain,
          name: s.name,
          isActive: s.isActive,
        })),
        connections: connRows.map((c) => ({
          id: c.id,
          platform: c.platform,
          orgName: c.orgName,
          isActive: c.isActive,
        })),
        channels: channelRows.map((c) => ({
          id: c.id,
          type: c.type,
          identifier: c.identifier,
        })),
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // PATCH /api/dashboard/preferences
  app.patch("/preferences", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = await resolveTenant(req);
      const parsed = UpdatePreferencesSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid preferences", details: parsed.error.flatten() });
      }

      const { timezone, currency, ...prefChanges } = parsed.data;

      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (timezone) {updates["timezone"] = timezone;}
      if (currency) {updates["currency"] = currency;}

      const rows = await db
        .select({ preferences: tenants.preferences })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);

      const existing = (rows[0]?.preferences as Record<string, unknown>) ?? {};
      updates["preferences"] = { ...existing, ...prefChanges };

      await db.update(tenants).set(updates).where(eq(tenants.id, tenantId));

      return reply.send({ success: true });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // POST /api/channels/whatsapp/link — link a WhatsApp number to a tenant
  app.post("/whatsapp/link", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = await resolveTenant(req);
      const { phone: rawPhone } = req.body as { phone?: string };

      // Normalize to E.164: strip everything except digits, prepend +
      const digits = (rawPhone ?? "").replace(/\D/g, "");
      if (digits.length < 7) {
        return reply.status(400).send({ error: "Invalid phone number" });
      }
      const phone = `+${digits}`;

      // Fetch tenant name for welcome message
      const tenantRow = await db
        .select({ name: tenants.name })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1)
        .then((r) => r[0]);
      const name = tenantRow?.name ?? "there";

      // Update tenant phone
      await db.update(tenants).set({ phone, updatedAt: new Date() }).where(eq(tenants.id, tenantId));

      // Upsert channel record
      await db
        .insert(channels)
        .values({ tenantId, type: "whatsapp", identifier: phone, isActive: true })
        .onConflictDoUpdate({
          target: [channels.tenantId, channels.type, channels.identifier],
          set: { isActive: true },
        });

      // Send welcome message (fire-and-forget — don't fail the link if WhatsApp is misconfigured)
      sendTextToPhone(
        phone,
        `Hey ${name}! 👋 Kommand is connected. Try asking me: *How's my store doing?*`
      ).catch((err) => {
        console.warn("[whatsapp/link] Welcome message failed:", err);
      });

      return reply.send({ success: true, phone });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // DELETE /api/channels/whatsapp — unlink WhatsApp number
  app.delete("/whatsapp", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = await resolveTenant(req);

      await db
        .update(channels)
        .set({ isActive: false })
        .where(and(eq(channels.tenantId, tenantId), eq(channels.type, "whatsapp")));

      await db
        .update(tenants)
        .set({ phone: null, updatedAt: new Date() })
        .where(eq(tenants.id, tenantId));

      return reply.send({ success: true });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // GET /api/dashboard/activity — recent agent runs
  app.get("/activity", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = await resolveTenant(req);
      const rows = await db
        .select({
          id: agentRuns.id,
          trigger: agentRuns.trigger,
          input: agentRuns.input,
          output: agentRuns.output,
          iterations: agentRuns.iterations,
          tokensInput: agentRuns.tokensInput,
          latencyMs: agentRuns.latencyMs,
          status: agentRuns.status,
          createdAt: agentRuns.createdAt,
        })
        .from(agentRuns)
        .where(eq(agentRuns.tenantId, tenantId))
        .orderBy(desc(agentRuns.createdAt))
        .limit(50);

      return reply.send(rows);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // GET /api/dashboard/conversation — last 50 messages
  app.get("/conversation", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = await resolveTenant(req);
      const rows = await db
        .select({
          id: messages.id,
          direction: messages.direction,
          role: messages.role,
          content: messages.content,
          createdAt: messages.createdAt,
        })
        .from(messages)
        .where(eq(messages.tenantId, tenantId))
        .orderBy(desc(messages.createdAt))
        .limit(50);

      return reply.send(rows.reverse());
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // DELETE /api/dashboard/stores/:storeId — disconnect a store
  app.delete("/stores/:storeId", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = await resolveTenant(req);
      const { storeId } = req.params as { storeId: string };

      await db
        .update(stores)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(stores.id, storeId));

      return reply.send({ success: true });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // DELETE /api/dashboard/connections/:connectionId — disconnect accounting
  app.delete("/connections/:connectionId", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = await resolveTenant(req);
      const { connectionId } = req.params as { connectionId: string };

      await db
        .update(accountingConnections)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(accountingConnections.id, connectionId));

      return reply.send({ success: true });
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
