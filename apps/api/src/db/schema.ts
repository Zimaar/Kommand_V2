import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  integer,
  jsonb,
  uniqueIndex,
  index,
  customType,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// ─── pgvector custom type ─────────────────────────────────────────────────────

const vector = customType<{
  data: number[];
  driverData: string;
  config: { dimensions: number };
}>({
  dataType(config) {
    return `vector(${config?.dimensions ?? 1536})`;
  },
  fromDriver(value: string): number[] {
    return JSON.parse(value) as number[];
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
});

// ─── tenants ──────────────────────────────────────────────────────────────────

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  clerkId: text("clerk_id").unique().notNull(),
  email: text("email").unique().notNull(),
  name: text("name"),
  phone: text("phone"),
  timezone: text("timezone").default("UTC").notNull(),
  currency: text("currency").default("USD").notNull(),
  plan: text("plan").default("trial").notNull(),
  planExpiresAt: timestamp("plan_expires_at", { withTimezone: true }),
  preferences: jsonb("preferences").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─── stores ───────────────────────────────────────────────────────────────────

export const stores = pgTable(
  "stores",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(), // shopify | woocommerce
    domain: text("domain").notNull(),
    name: text("name"),
    accessTokenEnc: text("access_token_enc").notNull(),
    tokenIv: text("token_iv").notNull(),
    tokenTag: text("token_tag").notNull(),
    scopes: text("scopes").array(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("stores_tenant_platform_domain_idx").on(t.tenantId, t.platform, t.domain),
    index("stores_tenant_idx").on(t.tenantId),
  ]
);

// ─── accounting_connections ───────────────────────────────────────────────────

export const accountingConnections = pgTable(
  "accounting_connections",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(), // xero | quickbooks
    orgId: text("org_id"),
    orgName: text("org_name"),
    accessTokenEnc: text("access_token_enc").notNull(),
    tokenIv: text("token_iv").notNull(),
    tokenTag: text("token_tag").notNull(),
    refreshTokenEnc: text("refresh_token_enc").notNull(),
    refreshTokenIv: text("refresh_token_iv").notNull(),
    refreshTokenTag: text("refresh_token_tag").notNull(),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("accounting_tenant_platform_org_idx").on(t.tenantId, t.platform, t.orgId),
    index("accounting_tenant_idx").on(t.tenantId),
  ]
);

// ─── channels ─────────────────────────────────────────────────────────────────

export const channels = pgTable(
  "channels",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // whatsapp | slack | email
    identifier: text("identifier").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("channels_tenant_type_identifier_idx").on(t.tenantId, t.type, t.identifier),
    index("channels_type_identifier_idx").on(t.type, t.identifier),
  ]
);

// ─── messages ─────────────────────────────────────────────────────────────────

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    direction: text("direction").notNull(), // inbound | outbound
    role: text("role").notNull(), // user | assistant | system
    content: text("content").notNull(),
    channelMsgId: text("channel_msg_id"),
    agentRunId: uuid("agent_run_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("messages_tenant_time_idx").on(t.tenantId, t.createdAt),
    uniqueIndex("messages_channel_msg_id_idx")
      .on(t.channelMsgId)
      .where(sql`channel_msg_id IS NOT NULL`),
  ]
);

// ─── agent_runs ───────────────────────────────────────────────────────────────

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    trigger: text("trigger").notNull(), // message | morning_brief | proactive | scheduled
    input: text("input").notNull(),
    output: text("output"),
    iterations: integer("iterations"),
    primitiveCalls: jsonb("primitive_calls"),
    tokensInput: integer("tokens_input"),
    tokensOutput: integer("tokens_output"),
    latencyMs: integer("latency_ms"),
    status: text("status").default("running").notNull(),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("agent_runs_tenant_time_idx").on(t.tenantId, t.createdAt),
    index("agent_runs_running_idx").on(t.status).where(sql`status = 'running'`),
  ]
);

// ─── pending_actions ──────────────────────────────────────────────────────────

export const pendingActions = pgTable(
  "pending_actions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    agentRunId: uuid("agent_run_id").references(() => agentRuns.id),
    actionType: text("action_type").notNull(),
    primitiveName: text("primitive_name").notNull(),
    primitiveInput: jsonb("primitive_input").notNull(),
    previewText: text("preview_text").notNull(),
    status: text("status").default("pending").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("pending_actions_tenant_pending_idx")
      .on(t.tenantId)
      .where(sql`status = 'pending'`),
  ]
);

// ─── memories ─────────────────────────────────────────────────────────────────
// Requires: CREATE EXTENSION IF NOT EXISTS vector;
// IVFFlat index created separately in migration (not expressible in Drizzle DSL).

export const memories = pgTable(
  "memories",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    category: text("category").notNull(), // preference|pattern|contact|decision|observation|workflow
    embedding: vector("embedding", { dimensions: 1536 }),
    sourceRunId: uuid("source_run_id"),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("memories_tenant_category_idx").on(t.tenantId, t.category),
    // Vector index (ivfflat) is created via custom migration SQL — see drizzle/0000_init_vector.sql
  ]
);

// ─── scheduled_jobs ───────────────────────────────────────────────────────────

export const scheduledJobs = pgTable(
  "scheduled_jobs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    jobType: text("job_type").notNull(), // morning_brief | proactive_analysis | custom
    prompt: text("prompt").notNull(),
    cron: text("cron").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("scheduled_jobs_next_run_idx").on(t.nextRunAt).where(sql`is_active = true`),
  ]
);

// ─── subscriptions ───────────────────────────────────────────────────────────

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(), // shopify | stripe
    externalId: text("external_id").notNull(), // Shopify charge_id or Stripe subscription_id
    plan: text("plan").notNull(), // starter | growth | pro
    status: text("status").default("pending").notNull(), // pending | active | cancelled | expired
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("subscriptions_provider_external_idx").on(t.provider, t.externalId),
    index("subscriptions_tenant_idx").on(t.tenantId),
  ]
);

// ─── generated_files ──────────────────────────────────────────────────────────

export const generatedFiles = pgTable(
  "generated_files",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    agentRunId: uuid("agent_run_id").references(() => agentRuns.id),
    filename: text("filename").notNull(),
    storagePath: text("storage_path").notNull(),
    downloadUrl: text("download_url").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("generated_files_tenant_time_idx").on(t.tenantId, t.createdAt),
  ]
);

// ─── Relations ────────────────────────────────────────────────────────────────

export const tenantsRelations = relations(tenants, ({ many }) => ({
  stores: many(stores),
  accountingConnections: many(accountingConnections),
  channels: many(channels),
  messages: many(messages),
  agentRuns: many(agentRuns),
  pendingActions: many(pendingActions),
  memories: many(memories),
  scheduledJobs: many(scheduledJobs),
  generatedFiles: many(generatedFiles),
  subscriptions: many(subscriptions),
}));

export const storesRelations = relations(stores, ({ one }) => ({
  tenant: one(tenants, { fields: [stores.tenantId], references: [tenants.id] }),
}));

export const accountingConnectionsRelations = relations(accountingConnections, ({ one }) => ({
  tenant: one(tenants, { fields: [accountingConnections.tenantId], references: [tenants.id] }),
}));

export const channelsRelations = relations(channels, ({ one }) => ({
  tenant: one(tenants, { fields: [channels.tenantId], references: [tenants.id] }),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  tenant: one(tenants, { fields: [messages.tenantId], references: [tenants.id] }),
  agentRun: one(agentRuns, { fields: [messages.agentRunId], references: [agentRuns.id] }),
}));

export const agentRunsRelations = relations(agentRuns, ({ one, many }) => ({
  tenant: one(tenants, { fields: [agentRuns.tenantId], references: [tenants.id] }),
  messages: many(messages),
  pendingActions: many(pendingActions),
  generatedFiles: many(generatedFiles),
}));

export const pendingActionsRelations = relations(pendingActions, ({ one }) => ({
  tenant: one(tenants, { fields: [pendingActions.tenantId], references: [tenants.id] }),
  agentRun: one(agentRuns, { fields: [pendingActions.agentRunId], references: [agentRuns.id] }),
}));

export const memoriesRelations = relations(memories, ({ one }) => ({
  tenant: one(tenants, { fields: [memories.tenantId], references: [tenants.id] }),
}));

export const scheduledJobsRelations = relations(scheduledJobs, ({ one }) => ({
  tenant: one(tenants, { fields: [scheduledJobs.tenantId], references: [tenants.id] }),
}));

export const generatedFilesRelations = relations(generatedFiles, ({ one }) => ({
  tenant: one(tenants, { fields: [generatedFiles.tenantId], references: [tenants.id] }),
  agentRun: one(agentRuns, { fields: [generatedFiles.agentRunId], references: [agentRuns.id] }),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  tenant: one(tenants, { fields: [subscriptions.tenantId], references: [tenants.id] }),
}));
