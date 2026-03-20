import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import sensible from "@fastify/sensible";
import rawBody from "fastify-raw-body";
import { config } from "./config.js";
import { initMonitoring, flushMonitoring } from "./utils/monitoring.js";
import { AppError, sendError } from "./utils/errors.js";
import { webhookRoutes } from "./routes/webhooks.js";
import { shopifyWebhookRoutes } from "./routes/shopify-webhooks.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { authRoutes } from "./routes/auth.js";
import { billingRoutes } from "./routes/billing.js";
import { redis } from "./lib/redis.js";
import { scheduler } from "./proactive/scheduler.js";

initMonitoring();

const startedAt = Date.now();

const loggerConfig =
  config.NODE_ENV !== "production"
    ? {
        level: "debug" as const,
        transport: { target: "pino-pretty", options: { colorize: true } },
      }
    : { level: "info" as const };

const app = Fastify({
  logger: loggerConfig,
  bodyLimit: 1 * 1024 * 1024, // 1 MB — reject oversized payloads before any processing
});

// ─── Plugins ──────────────────────────────────────────────────────────────────

await app.register(sensible);

// Raw body — opt-in per route via { config: { rawBody: true } }
// Required for Shopify webhook HMAC verification
await app.register(rawBody, { global: false, field: "rawBody", encoding: false });

await app.register(helmet, {
  // CSP is handled by the API gateway / reverse proxy in production
  contentSecurityPolicy: false,
});

const allowedOrigins = new Set([config.DASHBOARD_URL, "http://localhost:3001", "http://127.0.0.1:3001"]);
const localtunnelPattern = /^https:\/\/[a-z0-9-]+\.loca\.lt$/i;

await app.register(cors, {
  origin: (origin, cb) => {
    // Allow server-side / curl requests without an Origin header.
    if (!origin) {
      cb(null, true);
      return;
    }

    const isAllowed =
      allowedOrigins.has(origin) || (config.NODE_ENV === "development" && localtunnelPattern.test(origin));

    cb(null, isAllowed);
  },
  credentials: true,
});

// ─── Global error handler ─────────────────────────────────────────────────────

app.setErrorHandler((error: Error & { validation?: unknown; statusCode?: number }, _request, reply) => {
  if (error instanceof AppError) {
    return sendError(reply as Parameters<typeof sendError>[0], error);
  }

  // Fastify validation errors (from schema validation) — use 422 to match ValidationError
  if (error.validation) {
    return reply.status(422).send({
      success: false,
      error: { code: "VALIDATION_ERROR", message: error.message },
    });
  }

  app.log.error(error);
  return reply.status(500).send({
    success: false,
    error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" },
  });
});

// ─── Routes ───────────────────────────────────────────────────────────────────

app.get("/api/health", async () => ({
  status: "ok",
  version: "0.1.0",
  uptime: Math.floor((Date.now() - startedAt) / 1000),
}));

await app.register(authRoutes, { prefix: "/auth" });
await app.register(webhookRoutes, { prefix: "/webhooks" });
await app.register(shopifyWebhookRoutes, { prefix: "/webhooks" });
await app.register(dashboardRoutes, { prefix: "/api/dashboard" });
await app.register(billingRoutes, { prefix: "/billing" });

// ─── Graceful shutdown ────────────────────────────────────────────────────────

async function shutdown(signal: string): Promise<void> {
  app.log.info(`Received ${signal}, shutting down gracefully…`);
  await scheduler.shutdown();
  await flushMonitoring();
  await app.close();
  await redis.quit();
  process.exit(0);
}

process.on("SIGTERM", () => {
  shutdown("SIGTERM").catch((err) => {
    app.log.error(err, "Shutdown failed");
    process.exit(1);
  });
});
process.on("SIGINT", () => {
  shutdown("SIGINT").catch((err) => {
    app.log.error(err, "Shutdown failed");
    process.exit(1);
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────

try {
  await redis.connect();
  await app.listen({ port: config.PORT, host: "0.0.0.0" });
  app.log.info(`Kommand API running on port ${config.PORT}`);
  // Start job scheduler after server is ready
  await scheduler.init();
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
