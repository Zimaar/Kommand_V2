import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { config } from "./config.js";
import { webhookRoutes } from "./routes/webhooks.js";
import { dashboardRoutes } from "./routes/dashboard.js";

const app = Fastify({
  logger: {
    level: config.NODE_ENV === "production" ? "info" : "debug",
    transport:
      config.NODE_ENV !== "production"
        ? { target: "pino-pretty", options: { colorize: true } }
        : undefined,
  },
});

// Plugins
await app.register(helmet, {
  contentSecurityPolicy: false, // handled by API gateway
});

await app.register(cors, {
  origin: config.DASHBOARD_URL,
  credentials: true,
});

// Health check
app.get("/health", async () => ({ status: "ok", ts: new Date().toISOString() }));

// Routes
await app.register(webhookRoutes, { prefix: "/webhooks" });
await app.register(dashboardRoutes, { prefix: "/api/dashboard" });

// Start
try {
  await app.listen({ port: config.PORT, host: "0.0.0.0" });
  app.log.info(`Kommand API running on port ${config.PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
