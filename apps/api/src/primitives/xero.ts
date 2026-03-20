import { eq, and } from "drizzle-orm";
import { db } from "../db/connection.js";
import { accountingConnections } from "../db/schema.js";
import { getValidXeroToken } from "../auth/xero-token-refresh.js";
import { XeroApiInputSchema } from "@kommand/shared";
import type { PrimitiveResponse } from "@kommand/shared";
import type { PrimitiveDefinition } from "./types.js";

const XERO_BASE_URL = "https://api.xero.com/api.xro/2.0";

export const xeroDef: PrimitiveDefinition = {
  name: "xero_api",
  description:
    "Execute a Xero API request against the owner's accounting org. You construct the endpoint path and request body. Use this for invoices, bills, contacts, bank transactions, reports (P&L, balance sheet, aged receivables), and any other Xero operation. Base URL is https://api.xero.com/api.xro/2.0/. You provide the path after that.",
  inputSchema: {
    type: "object",
    properties: {
      method: {
        type: "string",
        enum: ["GET", "POST", "PUT", "DELETE"],
      },
      path: {
        type: "string",
        description:
          "API path after /api.xro/2.0/ — e.g., 'Invoices', 'Invoices?where=Status==\"OVERDUE\"', 'Reports/ProfitAndLoss'",
      },
      body: {
        type: "object",
        description: "Request body for POST/PUT operations.",
      },
    },
    required: ["method", "path"],
  },
  handler: xeroApi,
};

async function xeroApi(input: unknown, tenantId: string): Promise<PrimitiveResponse> {
  // 1. Validate input
  const parsed = XeroApiInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: `Invalid input: ${parsed.error.message}` };
  }
  const { method, path, body } = parsed.data;

  // 2. Look up active Xero connection for this tenant
  const rows = await db
    .select({ orgId: accountingConnections.orgId })
    .from(accountingConnections)
    .where(
      and(
        eq(accountingConnections.tenantId, tenantId),
        eq(accountingConnections.platform, "xero"),
        eq(accountingConnections.isActive, true)
      )
    )
    .limit(1);
  const conn = rows[0] ?? null;

  if (!conn) {
    return {
      success: false,
      error: "No active Xero connection found. Please connect your Xero account first.",
    };
  }

  if (!conn.orgId) {
    return {
      success: false,
      error: "Xero connection is missing organisation ID. Please reconnect Xero from the dashboard.",
    };
  }

  // 3. Get valid access token — refreshes automatically if expiring within 5 min
  let accessToken: string;
  try {
    accessToken = await getValidXeroToken(tenantId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: `Xero authentication error: ${msg}` };
  }

  // 4. Execute request with one-time 429 retry
  return callXero(method, path, body, accessToken, conn.orgId, false);
}

// ─── HTTP layer ───────────────────────────────────────────────────────────────

async function callXero(
  method: string,
  path: string,
  body: Record<string, unknown> | undefined,
  accessToken: string,
  xeroTenantId: string,
  isRetry: boolean
): Promise<PrimitiveResponse> {
  const cleanPath = path.startsWith("/") ? path.slice(1) : path;
  const url = `${XERO_BASE_URL}/${cleanPath}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "Xero-Tenant-Id": xeroTenantId,
    Accept: "application/json",
  };

  let init: RequestInit;
  if (method === "GET" || method === "DELETE") {
    init = { method, headers };
  } else {
    headers["Content-Type"] = "application/json";
    init = {
      method,
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
    };
  }

  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Network error";
    return { success: false, error: `Xero API network error: ${msg}` };
  }

  // Handle rate limiting — wait Retry-After, retry once
  if (response.status === 429) {
    if (!isRetry) {
      const retryAfterHeader = response.headers.get("Retry-After");
      const waitSeconds = retryAfterHeader ? parseFloat(retryAfterHeader) : 10;
      const waitMs = Math.min(isNaN(waitSeconds) ? 10_000 : waitSeconds * 1000, 60_000);
      await sleep(waitMs);
      return callXero(method, path, body, accessToken, xeroTenantId, true);
    }
    return { success: false, error: "Xero rate limit exceeded after retry. Please try again shortly." };
  }

  // Parse response body
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    return {
      success: false,
      error: `Xero API returned a non-JSON response (HTTP ${response.status}).`,
    };
  }

  if (!response.ok) {
    return { success: false, error: extractXeroError(data, response.status) };
  }

  // Return raw — the agent reasons about the shape, we don't transform
  return { success: true, data };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractXeroError(body: unknown, status: number): string {
  if (typeof body === "object" && body !== null) {
    const b = body as Record<string, unknown>;
    // Xero validation errors: { Type: "ValidationException", Elements: [...] }
    if (b.Type === "ValidationException" && Array.isArray(b.Elements)) {
      const msgs: string[] = [];
      for (const el of b.Elements as Array<Record<string, unknown>>) {
        if (Array.isArray(el.ValidationErrors)) {
          for (const ve of el.ValidationErrors as Array<Record<string, unknown>>) {
            if (typeof ve.Message === "string") msgs.push(ve.Message);
          }
        }
      }
      if (msgs.length > 0) return `Xero validation error: ${msgs.join("; ")}`;
    }
    if (typeof b.Detail === "string") return `Xero error: ${b.Detail}`;
    if (typeof b.Message === "string") return `Xero error: ${b.Message}`;
    if (typeof b.title === "string") return `Xero error: ${b.title}`;
  }
  return `Xero API error (HTTP ${status}).`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
