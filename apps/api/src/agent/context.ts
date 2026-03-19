import { eq, desc, and } from "drizzle-orm";
import { formatInTimeZone } from "date-fns-tz";
import { db } from "../db/connection.js";
import {
  tenants,
  stores,
  accountingConnections,
  messages,
  memories,
} from "../db/schema.js";
import type {
  AgentContext,
  TenantInfo,
  StoreInfo,
  AccountingConnectionInfo,
  ConversationMessage,
  MemoryEntry,
  PrimitiveName,
} from "@kommand/shared";
import {
  CONVERSATION_HISTORY_LENGTH,
  MEMORY_RETRIEVAL_COUNT,
} from "../config.js";

export async function buildContext(tenantId: string): Promise<AgentContext> {
  const [tenant, storeRows, connectionRows, historyRows, memoryRows] = await Promise.all([
    db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1),
    db.select().from(stores).where(and(eq(stores.tenantId, tenantId), eq(stores.isActive, true))),
    db
      .select()
      .from(accountingConnections)
      .where(
        and(
          eq(accountingConnections.tenantId, tenantId),
          eq(accountingConnections.isActive, true)
        )
      ),
    db
      .select()
      .from(messages)
      .where(eq(messages.tenantId, tenantId))
      .orderBy(desc(messages.createdAt))
      .limit(CONVERSATION_HISTORY_LENGTH),
    // TODO: replace with vector similarity search when pgvector is enabled
    db
      .select()
      .from(memories)
      .where(and(eq(memories.tenantId, tenantId), eq(memories.isActive, true)))
      .orderBy(desc(memories.createdAt))
      .limit(MEMORY_RETRIEVAL_COUNT),
  ]);

  const tenantRow = tenant[0];
  if (!tenantRow) {
    throw new Error(`Tenant ${tenantId} not found`);
  }

  const tenantInfo: TenantInfo = {
    id: tenantRow.id,
    name: tenantRow.name,
    email: tenantRow.email,
    phone: tenantRow.phone,
    timezone: tenantRow.timezone,
    currency: tenantRow.currency,
    plan: tenantRow.plan as TenantInfo["plan"],
    preferences: (tenantRow.preferences as Record<string, unknown>) ?? {},
  };

  const storeInfos: StoreInfo[] = storeRows.map((s) => ({
    id: s.id,
    platform: s.platform as StoreInfo["platform"],
    domain: s.domain,
    name: s.name,
  }));

  const connectionInfos: AccountingConnectionInfo[] = connectionRows.map((c) => ({
    id: c.id,
    platform: c.platform as AccountingConnectionInfo["platform"],
    orgId: c.orgId,
    orgName: c.orgName,
  }));

  // Determine which primitives are available based on what's connected
  const connectedPlatforms: PrimitiveName[] = [
    "run_code",
    "web_search",
    "generate_file",
    "memory",
  ];
  if (storeRows.length > 0) {connectedPlatforms.push("shopify_api");}
  if (connectionRows.length > 0) {connectedPlatforms.push("xero_api");}
  if (tenantRow.phone) {connectedPlatforms.push("send_comms");}

  // Conversation history (reversed to chronological order)
  const conversationHistory: ConversationMessage[] = historyRows
    .reverse()
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

  const businessMemory: MemoryEntry[] = memoryRows.map((m) => ({
    id: m.id,
    content: m.content,
    category: m.category as MemoryEntry["category"],
    createdAt: m.createdAt,
  }));

  const currentTime = formatInTimeZone(new Date(), tenantInfo.timezone, "PPpp zzz");

  return {
    tenant: tenantInfo,
    stores: storeInfos,
    connections: connectionInfos,
    connectedPlatforms,
    conversationHistory,
    businessMemory,
    currentTime,
  };
}
