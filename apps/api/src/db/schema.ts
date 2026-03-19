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
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { customType } from "drizzle-orm/pg-core";

// pgvector support
const vector = customType<{ data: number[]; driverData: string }>({
  dataType(config) {
    return `vector(${(config as { dimensions: number }).dimensions ?? 1536})`;
  },
  fromDriver(value: string): number[] {
    // pgvector returns '[1,2,3]' format
    return JSON.parse(value.replace("[", "[").replace("]", "]")) as number[];
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
});

// ─── tenants ─────────────────────────────────────────────────────────────────

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
  preferences: jsonb("preferences").default({}).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─── stores ──────────────────────────────────────────────────────────────────

export const stores = pgTable(
  "stores",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(), // shopify|woocommerce
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
  (t) => ({
    uniqueStore: uniqueIndex("stores_tenant_platform_domain_idx").on(
      t.tenantId,
      t.platform,
      t.domain
    ),
    tenantIdx: index("stores_tenant_idx").on(t.tenantId),
  })
);

// ─── accounting_connections ───────────────────────────────────────────────────

export const accountingConnections = pgTable(
  "accounting_connections",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(), // xero|quickbooks
    orgId: text("org_id"),
    orgName: text("org_name"),
    accessTokenEnc: text("access_token_enc").notNull(),
    refreshTokenEnc: text("refresh_token_enc").notNull(),
    tokenIv: text("token_iv").notNull(),
    tokenTag: text("token_tag").notNull(),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uniqueConn: uniqueIndex("accounting_tenant_platform_org_idx").on(
      t.tenantId,
      t.platform,
      t.orgId
    ),
    tenantIdx: index("accounting_tenant_idx").on(t.tenantId),
  })
);

// ─── channels ────────────────────────────────────────────────────────────────

export const channels = pgTable(
  "channels",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // whatsapp|slack|email
    identifier: text("identifier").notNull(), // phone or channel ID
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uniqueChannel: uniqueIndex("channels_tenant_type_identifier_idx").on(
      t.tenantId,
      t.type,
      t.identifier
    ),
    lookupIdx: index("channels_type_identifier_idx").on(t.type, t.identifier),
  })
);

// ─── messages ────────────────────────────────────────────────────────────────

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    direction: text("direction").notNull(), // inbound|outbound
    role: text("role").notNull(), // user|assistant|system
    content: text("content").notNull(),
    channelMsgId: text("channel_msg_id"),
    agentRunId: uuid("agent_run_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    tenantTimeIdx: index("messages_tenant_time_idx").on(t.tenantId, t.createdAt),
    uniqueMsgId: uniqueIndex("messages_channel_msg_id_idx")
      .on(t.channelMsgId)
      .where(sql`channel_msg_id IS NOT NULL`),
  })
);

// ─── agent_runs ───────────────────────────────────────────────────────────────

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    trigger: text("trigger").notNull(), // message|morning_brief|proactive|scheduled
    input: text("input").notNull(),
    output: text("output"),
    iterations: integer("iterations"),
    primitiveCalls: jsonb("primitive_calls"), // array of PrimitiveCallLog
    tokensInput: integer("tokens_input"),
    tokensOutput: integer("tokens_output"),
    latencyMs: integer("latency_ms"),
    status: text("status").default("running").notNull(),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    tenantTimeIdx: index("agent_runs_tenant_time_idx").on(t.tenantId, t.createdAt),
    runningIdx: index("agent_runs_running_idx")
      .on(t.status)
      .where(sql`status = 'running'`),
  })
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
  (t) => ({
    pendingIdx: index("pending_actions_tenant_pending_idx")
      .on(t.tenantId)
      .where(sql`status = 'pending'`),
  })
);

// ─── memories ─────────────────────────────────────────────────────────────────

export const memories = pgTable(
  "memories",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    category: text("category").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }),
    sourceRunId: uuid("source_run_id"),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    tenantCategoryIdx: index("memories_tenant_category_idx").on(t.tenantId, t.category),
  })
);

// ─── scheduled_jobs ───────────────────────────────────────────────────────────

export const scheduledJobs = pgTable(
  "scheduled_jobs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    jobType: text("job_type").notNull(), // morning_brief|proactive_analysis|custom
    prompt: text("prompt").notNull(),
    cron: text("cron").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    nextRunIdx: index("scheduled_jobs_next_run_idx")
      .on(t.nextRunAt)
      .where(sql`is_active = true`),
  })
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
  (t) => ({
    tenantTimeIdx: index("generated_files_tenant_time_idx").on(t.tenantId, t.createdAt),
  })
);

// ─── Drizzle schema export ────────────────────────────────────────────────────

export const schema = {
  tenants,
  stores,
  accountingConnections,
  channels,
  messages,
  agentRuns,
  pendingActions,
  memories,
  scheduledJobs,
  generatedFiles,
};
