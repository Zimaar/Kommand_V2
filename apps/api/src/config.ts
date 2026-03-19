import { z } from "zod";

// In development, most external services aren't connected yet.
// Only DATABASE_URL, REDIS_URL, and core server vars are required.
const isDev = process.env.NODE_ENV !== "production";

// Treat empty strings as undefined so .default("") kicks in
const emptyToUndefined = z.preprocess(
  (v) => (v === "" || v === undefined ? undefined : v),
  z.string().default("")
);

const optionalInDev = (base: z.ZodString) =>
  isDev ? emptyToUndefined : base;

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3000),
  API_URL: z.string().url().default("http://localhost:3000"),
  DASHBOARD_URL: z.string().url().default("http://localhost:3001"),

  // Database — always required
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  // AI
  ANTHROPIC_API_KEY: isDev ? emptyToUndefined : z.string().startsWith("sk-ant-"),

  // Code sandbox
  E2B_API_KEY: optionalInDev(z.string().min(1)),

  // File storage
  SUPABASE_URL: isDev ? emptyToUndefined : z.string().url(),
  SUPABASE_SERVICE_KEY: optionalInDev(z.string().min(1)),
  SUPABASE_STORAGE_BUCKET: z.string().default("kommand-files"),

  // WhatsApp
  WHATSAPP_PHONE_NUMBER_ID: optionalInDev(z.string().min(1)),
  WHATSAPP_BUSINESS_ACCOUNT_ID: optionalInDev(z.string().min(1)),
  WHATSAPP_ACCESS_TOKEN: optionalInDev(z.string().min(1)),
  WHATSAPP_VERIFY_TOKEN: z.string().default("kommand-verify"),
  WHATSAPP_APP_SECRET: optionalInDev(z.string().min(1)),

  // Shopify
  SHOPIFY_API_KEY: optionalInDev(z.string().min(1)),
  SHOPIFY_API_SECRET: optionalInDev(z.string().min(1)),
  SHOPIFY_SCOPES: z
    .string()
    .default(
      "read_orders,write_orders,read_products,write_products,read_inventory,write_inventory,read_customers,read_analytics"
    ),

  // Xero
  XERO_CLIENT_ID: optionalInDev(z.string().min(1)),
  XERO_CLIENT_SECRET: optionalInDev(z.string().min(1)),

  // Auth
  CLERK_PUBLISHABLE_KEY: optionalInDev(z.string().min(1)),
  CLERK_SECRET_KEY: optionalInDev(z.string().min(1)),
  CLERK_WEBHOOK_SECRET: optionalInDev(z.string().min(1)),

  // Encryption
  ENCRYPTION_KEY: isDev
    ? z.preprocess(
        (v) => (v === "" || v === undefined ? undefined : v),
        z.string().default("0".repeat(64))
      )
    : z.string().length(64),

  // Monitoring (always optional)
  SENTRY_DSN: z.string().optional(),
  AXIOM_DATASET: z.string().optional(),
  AXIOM_TOKEN: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

function loadConfig(): Env {
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
