import * as Sentry from "@sentry/node";
import { config } from "../config.js";

// ─── Sentry init ──────────────────────────────────────────────────────────────

let sentryInitialized = false;

export function initMonitoring(): void {
  if (sentryInitialized) return;

  if (config.SENTRY_DSN) {
    Sentry.init({
      dsn: config.SENTRY_DSN,
      environment: config.NODE_ENV,
      tracesSampleRate: config.NODE_ENV === "production" ? 0.2 : 1.0,
      profilesSampleRate: config.NODE_ENV === "production" ? 0.1 : 1.0,
    });
    sentryInitialized = true;
  }
}

// ─── Error capture ────────────────────────────────────────────────────────────

export function captureError(
  error: unknown,
  context?: Record<string, unknown>
): void {
  if (sentryInitialized) {
    Sentry.withScope((scope) => {
      if (context) {
        scope.setExtras(context);
        if (context.tenantId) scope.setTag("tenantId", String(context.tenantId));
        if (context.trigger) scope.setTag("trigger", String(context.trigger));
        if (context.primitive) scope.setTag("primitive", String(context.primitive));
      }
      Sentry.captureException(error);
    });
  }
}

// ─── Structured logger ────────────────────────────────────────────────────────
// JSON lines to stdout — compatible with Railway, Axiom, Datadog, etc.

type LogLevel = "info" | "warn" | "error";

function emit(level: LogLevel, event: string, data: Record<string, unknown>): void {
  const entry = {
    level,
    event,
    timestamp: new Date().toISOString(),
    ...data,
  };
  const line = JSON.stringify(entry);
  if (level === "error") {
    process.stderr.write(line + "\n");
  } else {
    process.stdout.write(line + "\n");
  }
}

// ─── Domain-specific log helpers ──────────────────────────────────────────────

export function logAgentRun(data: {
  tenantId: string;
  runId: string;
  trigger: string;
  iterations: number;
  tokensUsed: number;
  latencyMs: number;
  primitiveCalls: Array<{ name: string; success: boolean; latencyMs: number }>;
  status: "completed" | "failed";
  error?: string;
}): void {
  emit(data.status === "failed" ? "error" : "info", "agent.run", data);
}

export function logPrimitiveCall(data: {
  tenantId: string;
  runId?: string | undefined;
  primitive: string;
  latencyMs: number;
  success: boolean;
  error?: string | undefined;
}): void {
  emit(data.success ? "info" : "warn", "primitive.call", data);
}

export function logWebhook(data: {
  channel: string;
  event: string;
  tenantId?: string;
  processingMs: number;
  success: boolean;
  error?: string;
}): void {
  emit(data.success ? "info" : "error", "webhook.received", data);
}

export function logBilling(data: {
  tenantId: string;
  provider: string;
  action: string;
  plan?: string;
  success: boolean;
  error?: string;
}): void {
  emit(data.success ? "info" : "error", "billing.event", data);
}

// ─── Sentry flush for graceful shutdown ───────────────────────────────────────

export async function flushMonitoring(): Promise<void> {
  if (sentryInitialized) {
    await Sentry.close(2000);
  }
}
