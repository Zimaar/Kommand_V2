import crypto from "node:crypto";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { eq, desc, and, ilike, gte } from "drizzle-orm";
import { db } from "../db/connection.js";
import {
  tenants,
  stores,
  accountingConnections,
  channels,
  agentRuns,
  messages,
  scheduledJobs,
  memories,
} from "../db/schema.js";
import { UpdatePreferencesSchema } from "@kommand/shared";
import { sendError, UnauthorizedError, NotFoundError } from "../utils/errors.js";
import { sendTextToPhone } from "../channels/whatsapp.js";
import { buildShopifyInstallUrl } from "../auth/shopify-oauth.js";
import { generatePKCE, buildXeroAuthUrl } from "../auth/xero-oauth.js";
import { NONCE_TTL_SECONDS } from "./auth.js";
import { redis } from "../lib/redis.js";

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
      if (digits.length < 8) {
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
        .where(and(eq(stores.id, storeId), eq(stores.tenantId, tenantId)));

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
        .where(and(eq(accountingConnections.id, connectionId), eq(accountingConnections.tenantId, tenantId)));

      return reply.send({ success: true });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // PUT /api/dashboard/preferences — save onboarding preferences + upsert scheduled jobs
  app.put("/preferences", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = await resolveTenant(req);

      const {
        timezone,
        currency,
        briefTime = "08:00",
        notifications = {},
      } = req.body as {
        timezone?: string;
        currency?: string;
        briefTime?: string;
        notifications?: {
          newOrders?: boolean;
          lowStock?: boolean;
          dailyBrief?: boolean;
        };
      };

      // Merge into existing preferences
      const rows = await db
        .select({ preferences: tenants.preferences })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);

      const existing = (rows[0]?.preferences as Record<string, unknown>) ?? {};
      const merged: Record<string, unknown> = {
        ...existing,
        morning_brief_time: briefTime,
        notifications: {
          newOrders: notifications.newOrders !== false,
          lowStock: notifications.lowStock !== false,
          dailyBrief: notifications.dailyBrief !== false,
        },
      };

      const tenantUpdates: Record<string, unknown> = {
        preferences: merged,
        updatedAt: new Date(),
      };
      if (timezone) { tenantUpdates.timezone = timezone; }
      if (currency) { tenantUpdates.currency = currency; }

      await db.update(tenants).set(tenantUpdates).where(eq(tenants.id, tenantId));

      // Build cron from briefTime (HH:MM in tenant's local time — scheduler honours timezone)
      const [briefHourStr = "8", briefMinStr = "0"] = briefTime.split(":");
      const briefCron = `${Number(briefMinStr)} ${Number(briefHourStr)} * * *`;
      const dailyBriefEnabled = notifications.dailyBrief !== false;

      // Replace scheduled jobs for this tenant — delete then re-insert so settings stay fresh
      await db
        .delete(scheduledJobs)
        .where(and(eq(scheduledJobs.tenantId, tenantId), eq(scheduledJobs.jobType, "morning_brief")));

      await db
        .delete(scheduledJobs)
        .where(and(eq(scheduledJobs.tenantId, tenantId), eq(scheduledJobs.jobType, "proactive_analysis")));

      await db.insert(scheduledJobs).values([
        {
          tenantId,
          jobType: "morning_brief",
          prompt:
            "Generate a morning brief: yesterday's sales total, top 3 products, any pending orders, and one key insight the owner should act on today.",
          cron: briefCron,
          isActive: dailyBriefEnabled,
        },
        {
          tenantId,
          jobType: "proactive_analysis",
          prompt:
            "Scan for anomalies in the last 48 hours: unusual return rate spikes, inventory below re-order threshold, order velocity changes. Alert the owner if anything is notable.",
          cron: "0 */4 * * *", // every 4 hours
          isActive: true,
        },
      ]);

      return reply.send({ success: true });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // GET /api/dashboard/connections — unified list of all integrations
  app.get("/connections", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = await resolveTenant(req);
      const [storeRows, connRows, channelRows] = await Promise.all([
        db.select().from(stores).where(and(eq(stores.tenantId, tenantId), eq(stores.isActive, true))),
        db.select().from(accountingConnections).where(and(eq(accountingConnections.tenantId, tenantId), eq(accountingConnections.isActive, true))),
        db.select().from(channels).where(and(eq(channels.tenantId, tenantId), eq(channels.isActive, true))),
      ]);
      return reply.send({
        stores: storeRows.map((s) => ({
          id: s.id,
          platform: s.platform,
          domain: s.domain,
          name: s.name,
          isActive: s.isActive,
          createdAt: s.createdAt,
        })),
        connections: connRows.map((c) => ({
          id: c.id,
          platform: c.platform,
          orgName: c.orgName,
          isActive: c.isActive,
          createdAt: c.createdAt,
        })),
        channels: channelRows.map((c) => ({
          id: c.id,
          type: c.type,
          identifier: c.identifier,
          isActive: c.isActive,
          createdAt: c.createdAt,
        })),
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // GET /api/dashboard/messages — paginated with optional primitive calls
  app.get("/messages", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = await resolveTenant(req);
      const { limit: limitStr = "50", offset: offsetStr = "0" } = req.query as Record<string, string>;
      const limit = Math.min(Number(limitStr) || 50, 200);
      const offset = Number(offsetStr) || 0;

      const rows = await db
        .select({
          id: messages.id,
          direction: messages.direction,
          role: messages.role,
          content: messages.content,
          createdAt: messages.createdAt,
          primitiveCalls: agentRuns.primitiveCalls,
        })
        .from(messages)
        .leftJoin(agentRuns, eq(messages.agentRunId, agentRuns.id))
        .where(eq(messages.tenantId, tenantId))
        .orderBy(desc(messages.createdAt))
        .limit(limit)
        .offset(offset);

      return reply.send(rows.reverse());
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // GET /api/dashboard/messages/search?q=
  app.get("/messages/search", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = await resolveTenant(req);
      const { q = "" } = req.query as Record<string, string>;
      if (!q.trim()) { return reply.send([]); }

      const rows = await db
        .select({
          id: messages.id,
          direction: messages.direction,
          role: messages.role,
          content: messages.content,
          createdAt: messages.createdAt,
          primitiveCalls: agentRuns.primitiveCalls,
        })
        .from(messages)
        .leftJoin(agentRuns, eq(messages.agentRunId, agentRuns.id))
        .where(and(eq(messages.tenantId, tenantId), ilike(messages.content, `%${q}%`)))
        .orderBy(desc(messages.createdAt))
        .limit(50);

      return reply.send(rows.reverse());
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // GET /api/dashboard/memories — list active memories
  app.get("/memories", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = await resolveTenant(req);
      const rows = await db
        .select({
          id: memories.id,
          content: memories.content,
          category: memories.category,
          createdAt: memories.createdAt,
        })
        .from(memories)
        .where(and(eq(memories.tenantId, tenantId), eq(memories.isActive, true)))
        .orderBy(desc(memories.createdAt));
      return reply.send(rows);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // DELETE /api/dashboard/memories/:id — soft delete
  app.delete("/memories/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = await resolveTenant(req);
      const { id } = req.params as { id: string };
      await db
        .update(memories)
        .set({ isActive: false })
        .where(and(eq(memories.id, id), eq(memories.tenantId, tenantId)));
      return reply.send({ success: true });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // GET /api/dashboard/usage — runs + tokens this month, plan limits
  app.get("/usage", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = await resolveTenant(req);
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const [runRows, tenantRow] = await Promise.all([
        db
          .select({ tokensInput: agentRuns.tokensInput, tokensOutput: agentRuns.tokensOutput })
          .from(agentRuns)
          .where(and(eq(agentRuns.tenantId, tenantId), gte(agentRuns.createdAt, startOfMonth))),
        db.select({ plan: tenants.plan }).from(tenants).where(eq(tenants.id, tenantId)).limit(1).then((r) => r[0]),
      ]);

      const plan = tenantRow?.plan ?? "trial";
      const runsThisMonth = runRows.length;
      const tokensThisMonth = runRows.reduce((sum, r) => sum + (r.tokensInput ?? 0) + (r.tokensOutput ?? 0), 0);

      const LIMITS: Record<string, { runs: number; tokens: number }> = {
        trial: { runs: 50, tokens: 100_000 },
        starter: { runs: 500, tokens: 1_000_000 },
        growth: { runs: 2_000, tokens: 5_000_000 },
        pro: { runs: 10_000, tokens: 25_000_000 },
      };
      const limits = LIMITS[plan] ?? { runs: 50, tokens: 100_000 };

      return reply.send({ plan, runsThisMonth, tokensThisMonth, runsLimit: limits.runs, tokensLimit: limits.tokens });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // POST /api/dashboard/connections/xero/initiate — start Xero OAuth
  // Returns { url } so the client can redirect; does NOT redirect server-side.
  app.post("/connections/xero/initiate", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = await resolveTenant(req);

      const state = crypto.randomUUID();
      const { verifier, challenge } = generatePKCE();

      await redis.set(
        `oauth:xero:${state}`,
        JSON.stringify({ tenantId, verifier }),
        "EX",
        NONCE_TTL_SECONDS
      );

      const url = buildXeroAuthUrl(state, challenge);
      return reply.send({ url });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // POST /api/dashboard/connections/shopify/initiate — start Shopify OAuth
  // Returns { url } so the client can redirect; does NOT redirect server-side.
  app.post("/connections/shopify/initiate", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = await resolveTenant(req);
      const { shop: rawShop } = req.body as { shop?: string };

      if (!rawShop) {
        return reply.status(400).send({ error: "Missing shop domain" });
      }

      const shop = rawShop.trim().toLowerCase();

      if (!/^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(shop)) {
        return reply.status(400).send({ error: "Invalid shop domain — use format: yourstore.myshopify.com" });
      }

      const state = crypto.randomUUID();
      await redis.set(`oauth:nonce:${state}`, tenantId, "EX", 300);

      const url = buildShopifyInstallUrl(shop, state);
      return reply.send({ url });
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
