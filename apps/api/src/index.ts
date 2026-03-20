import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import sensible from "@fastify/sensible";
import rawBody from "fastify-raw-body";
import { config } from "./config.js";
import { AppError, sendError } from "./utils/errors.js";
import { webhookRoutes } from "./routes/webhooks.js";
import { shopifyWebhookRoutes } from "./routes/shopify-webhooks.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { authRoutes } from "./routes/auth.js";
import { redis } from "./lib/redis.js";
import { scheduler } from "./proactive/scheduler.js";

const startedAt = Date.now();

const loggerConfig =
  config.NODE_ENV !== "production"
    ? {
        level: "debug" as const,
        transport: { target: "pino-pretty", options: { colorize: true } },
      }
    : { level: "info" as const };

const app = Fastify({ logger: loggerConfig });

// ─── Plugins ──────────────────────────────────────────────────────────────────

await app.register(sensible);

// Raw body — opt-in per route via { config: { rawBody: true } }
// Required for Shopify webhook HMAC verification
await app.register(rawBody, { global: false, field: "rawBody", encoding: false });

await app.register(helmet, {
  // CSP is handled by the API gateway / reverse proxy in production
  contentSecurityPolicy: false,
});

await app.register(cors, {
  origin: config.DASHBOARD_URL,
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

// ─── Graceful shutdown ────────────────────────────────────────────────────────

async function shutdown(signal: string): Promise<void> {
  app.log.info(`Received ${signal}, shutting down gracefully…`);
  await scheduler.shutdown();
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
