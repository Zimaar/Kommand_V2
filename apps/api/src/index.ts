import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import sensible from "@fastify/sensible";
import { config } from "./config.js";
import { AppError, sendError } from "./utils/errors.js";
import { webhookRoutes } from "./routes/webhooks.js";
import { dashboardRoutes } from "./routes/dashboard.js";

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

await app.register(helmet, {
  contentSecurityPolicy: false,
});

await app.register(cors, {
  origin: config.DASHBOARD_URL,
  credentials: true,
});

// ─── Global error handler ─────────────────────────────────────────────────────

app.setErrorHandler((error: Error & { validation?: unknown }, _request, reply) => {
  if (error instanceof AppError) {
    return sendError(reply as Parameters<typeof sendError>[0], error);
  }

  // Fastify validation errors (from schema validation)
  if (error.validation) {
    return reply.status(400).send({
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

await app.register(webhookRoutes, { prefix: "/webhooks" });
await app.register(dashboardRoutes, { prefix: "/api/dashboard" });

// ─── Graceful shutdown ────────────────────────────────────────────────────────

async function shutdown(signal: string): Promise<void> {
  app.log.info(`Received ${signal}, shutting down gracefully…`);
  await app.close();
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// ─── Start ────────────────────────────────────────────────────────────────────

try {
  await app.listen({ port: config.PORT, host: "0.0.0.0" });
  app.log.info(`Kommand API running on port ${config.PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
