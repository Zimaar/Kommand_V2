import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3000),
  API_URL: z.string().url(),
  DASHBOARD_URL: z.string().url(),

  // Database
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  // AI
  ANTHROPIC_API_KEY: z.string().startsWith("sk-ant-"),

  // Code sandbox
  E2B_API_KEY: z.string().min(1),

  // File storage
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_KEY: z.string().min(1),
  SUPABASE_STORAGE_BUCKET: z.string().default("kommand-files"),

  // WhatsApp
  WHATSAPP_PHONE_NUMBER_ID: z.string().min(1),
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().min(1),
  WHATSAPP_ACCESS_TOKEN: z.string().min(1),
  WHATSAPP_VERIFY_TOKEN: z.string().default("kommand-verify"),
  WHATSAPP_APP_SECRET: z.string().min(1),

  // Shopify
  SHOPIFY_API_KEY: z.string().min(1),
  SHOPIFY_API_SECRET: z.string().min(1),
  SHOPIFY_SCOPES: z
    .string()
    .default(
      "read_orders,write_orders,read_products,write_products,read_inventory,write_inventory,read_customers,read_analytics"
    ),

  // Xero
  XERO_CLIENT_ID: z.string().min(1),
  XERO_CLIENT_SECRET: z.string().min(1),

  // Auth
  CLERK_PUBLISHABLE_KEY: z.string().min(1),
  CLERK_SECRET_KEY: z.string().min(1),
  CLERK_WEBHOOK_SECRET: z.string().min(1),

  // Encryption
  ENCRYPTION_KEY: z.string().length(64), // 32 bytes as hex = 64 chars

  // Monitoring (optional in dev)
  SENTRY_DSN: z.string().optional(),
  AXIOM_DATASET: z.string().optional(),
  AXIOM_TOKEN: z.string().optional(),
});

function loadConfig() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error("Invalid environment variables:");
    console.error(result.error.flatten().fieldErrors);
    process.exit(1);
  }
  return result.data;
}

export const config = loadConfig();

// Constants
export const AGENT_MODEL = "claude-sonnet-4-20250514";
export const MAX_AGENT_ITERATIONS = 25;
export const CONVERSATION_HISTORY_LENGTH = 15;
export const MEMORY_RETRIEVAL_COUNT = 20;
export const PENDING_ACTION_EXPIRY_MINUTES = 10;

export const TOKEN_LIMITS: Record<string, number> = {
  trial: 30000,
  starter: 30000,
  growth: 60000,
  pro: 100000,
};

export const THINKING_BUDGETS: Record<string, number> = {
  trial: 5000,
  starter: 5000,
  growth: 10000,
  pro: 15000,
};
