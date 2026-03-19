// Core domain types for Kommand

export type TenantPlan = "trial" | "starter" | "growth" | "pro";
export type StorePlatform = "shopify" | "woocommerce";
export type AccountingPlatform = "xero" | "quickbooks";
export type ChannelType = "whatsapp" | "slack" | "email";
export type MessageDirection = "inbound" | "outbound";
export type MessageRole = "user" | "assistant" | "system";
export type AgentRunStatus = "running" | "completed" | "failed" | "timeout";
export type PendingActionStatus = "pending" | "confirmed" | "cancelled" | "expired";
export type MemoryCategory =
  | "preference"
  | "pattern"
  | "contact"
  | "decision"
  | "observation"
  | "workflow";
export type ScheduledJobType = "morning_brief" | "proactive_analysis" | "custom";
export type AgentRunTrigger = "message" | "morning_brief" | "proactive" | "scheduled";

// Primitive names
export type PrimitiveName =
  | "shopify_api"
  | "xero_api"
  | "run_code"
  | "web_search"
  | "generate_file"
  | "send_comms"
  | "memory";

// Primitive result shape — primitives never throw
export interface PrimitiveResult<T = unknown> {
  success: true;
  data: T;
}

export interface PrimitiveError {
  success: false;
  error: string;
}

export type PrimitiveResponse<T = unknown> = PrimitiveResult<T> | PrimitiveError;

// Primitive inputs
export interface ShopifyApiInput {
  method: "graphql" | "rest_get" | "rest_post" | "rest_put" | "rest_delete";
  query: string;
  variables?: Record<string, unknown>;
}

export interface XeroApiInput {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  body?: Record<string, unknown>;
}

export interface RunCodeInput {
  code: string;
}

export interface WebSearchInput {
  action: "search" | "fetch_url";
  query: string;
}

export interface GenerateFileInput {
  filename: string;
  content: string;
  content_type: "text/plain" | "text/csv" | "application/json" | "text/markdown";
}

export interface SendCommsInput {
  channel: "whatsapp" | "email";
  to: string;
  subject?: string;
  body: string;
}

export interface MemoryInput {
  action: "read" | "write";
  query: string;
  category?: MemoryCategory;
}

// Agent context assembled before each run
export interface TenantInfo {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  timezone: string;
  currency: string;
  plan: TenantPlan;
  preferences: Record<string, unknown>;
}

export interface StoreInfo {
  id: string;
  platform: StorePlatform;
  domain: string;
  name: string | null;
  currency?: string;
}

export interface AccountingConnectionInfo {
  id: string;
  platform: AccountingPlatform;
  orgId: string | null;
  orgName: string | null;
}

export interface MemoryEntry {
  id: string;
  content: string;
  category: MemoryCategory;
  createdAt: Date;
}

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AgentContext {
  tenant: TenantInfo;
  stores: StoreInfo[];
  connections: AccountingConnectionInfo[];
  connectedPlatforms: PrimitiveName[];
  conversationHistory: ConversationMessage[];
  businessMemory: MemoryEntry[];
  currentTime: string;
  pendingAlerts?: Array<{ message: string }>;
}

// Agent run output
export interface PrimitiveCallLog {
  name: PrimitiveName;
  inputSummary: string;
  success: boolean;
  latencyMs: number;
}

export interface AgentResponse {
  text: string;
  files?: Array<{ url: string; filename: string }>;
  agentRunId: string;
  iterations: number;
  tokensUsed: number;
  latencyMs: number;
  primitivesCalled: PrimitiveCallLog[];
}

// Channel-agnostic inbound message
export interface InboundMessage {
  tenantId: string;
  channelType: ChannelType;
  channelMessageId: string;
  from: string; // phone/email of the sender
  text: string;
  timestamp: Date;
}

// WhatsApp-specific outbound formatting
export type WhatsAppMessageType = "text" | "image" | "document" | "interactive";

export interface WhatsAppButton {
  id: string;
  title: string;
}

export interface OutboundMessage {
  to: string;
  type: WhatsAppMessageType;
  text?: string;
  buttons?: WhatsAppButton[];
  documentUrl?: string;
  documentFilename?: string;
  caption?: string;
}
