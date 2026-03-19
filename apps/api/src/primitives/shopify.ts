import { eq, and } from "drizzle-orm";
import { db } from "../db/connection.js";
import { stores } from "../db/schema.js";
import { decryptToken } from "../auth/encryption.js";
import { ShopifyApiInputSchema } from "@kommand/shared";
import type { PrimitiveResponse } from "@kommand/shared";
import type { PrimitiveDefinition } from "./types.js";

const SHOPIFY_API_VERSION = "2024-10";

export const shopifyDef: PrimitiveDefinition = {
  name: "shopify_api",
  description:
    "Execute a Shopify Admin API request against the owner's store. You can run any GraphQL query or mutation, or any REST API call. Use this to read orders, products, customers, inventory, analytics — and to create refunds, discounts, fulfillments, or any other write operation. You write the query. Shopify API version: 2024-10.",
  inputSchema: {
    type: "object",
    properties: {
      method: {
        type: "string",
        enum: ["graphql", "rest_get", "rest_post", "rest_put", "rest_delete"],
        description:
          "Use graphql for most operations. Use rest_* only for endpoints not available in GraphQL.",
      },
      query: {
        type: "string",
        description:
          "For graphql: the full GraphQL query or mutation string. For rest_*: the API path (e.g., '/orders/12345.json').",
      },
      variables: {
        type: "object",
        description: "GraphQL variables, or REST request body for POST/PUT.",
      },
    },
    required: ["method", "query"],
  },
  handler: shopifyApi,
};

async function shopifyApi(input: unknown, tenantId: string): Promise<PrimitiveResponse> {
  // 1. Validate input
  const parsed = ShopifyApiInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: `Invalid input: ${parsed.error.message}` };
  }
  const { method, query, variables } = parsed.data;

  // 2. Look up active Shopify store for this tenant
  const store = await db.query.stores.findFirst({
    where: and(
      eq(stores.tenantId, tenantId),
      eq(stores.platform, "shopify"),
      eq(stores.isActive, true)
    ),
  });

  if (!store) {
    return {
      success: false,
      error: "No active Shopify store connected. Please connect your Shopify store first.",
    };
  }

  // 3. Decrypt access token — never logged, never passed to the agent
  let accessToken: string;
  try {
    accessToken = decryptToken(store.accessTokenEnc, store.tokenIv, store.tokenTag);
  } catch {
    return {
      success: false,
      error: "Failed to decrypt Shopify access token. Please reconnect your store.",
    };
  }

  // 4. Execute request with one-time 429 retry
  return callShopify(method, store.domain, query, variables, accessToken, false);
}

// ─── HTTP layer ───────────────────────────────────────────────────────────────

async function callShopify(
  method: string,
  domain: string,
  query: string,
  variables: Record<string, unknown> | undefined,
  accessToken: string,
  isRetry: boolean
): Promise<PrimitiveResponse> {
  const baseUrl = `https://${domain}/admin/api/${SHOPIFY_API_VERSION}`;
  const headers: Record<string, string> = {
    "X-Shopify-Access-Token": accessToken,
    "Content-Type": "application/json",
  };

  let url: string;
  let init: RequestInit;

  if (method === "graphql") {
    url = `${baseUrl}/graphql.json`;
    init = {
      method: "POST",
      headers,
      body: JSON.stringify({ query, variables: variables ?? {} }),
    };
  } else {
    // REST — query is the API path e.g. '/orders/12345.json'
    const path = query.startsWith("/") ? query.slice(1) : query;
    url = `${baseUrl}/${path}`;

    if (method === "rest_get") {
      init = { method: "GET", headers };
    } else if (method === "rest_delete") {
      init = { method: "DELETE", headers };
    } else {
      // rest_post | rest_put
      init = {
        method: method === "rest_post" ? "POST" : "PUT",
        headers,
        body: variables ? JSON.stringify(variables) : undefined,
      };
    }
  }

  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Network error";
    return { success: false, error: `Shopify API network error: ${msg}` };
  }

  // Handle rate limiting — wait Retry-After, retry once
  if (response.status === 429 && !isRetry) {
    const retryAfterHeader = response.headers.get("Retry-After");
    const waitSeconds = retryAfterHeader ? parseFloat(retryAfterHeader) : 2;
    const waitMs = Math.min(isNaN(waitSeconds) ? 2000 : waitSeconds * 1000, 30_000);
    await sleep(waitMs);
    return callShopify(method, domain, query, variables, accessToken, true);
  }

  // Parse response body
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    return {
      success: false,
      error: `Shopify API returned a non-JSON response (HTTP ${response.status}).`,
    };
  }

  // Non-2xx after possible retry
  if (!response.ok) {
    return { success: false, error: extractShopifyError(data, response.status) };
  }

  // Return raw — the agent reasons about the shape, we don't transform
  return { success: true, data };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractShopifyError(body: unknown, status: number): string {
  if (typeof body === "object" && body !== null) {
    const b = body as Record<string, unknown>;
    if (typeof b.errors === "string") return `Shopify error: ${b.errors}`;
    if (typeof b.error === "string") return `Shopify error: ${b.error}`;
    if (Array.isArray(b.errors)) {
      const first = b.errors[0];
      if (typeof first === "object" && first !== null) {
        const msg = (first as Record<string, unknown>).message;
        return `Shopify error: ${typeof msg === "string" ? msg : JSON.stringify(first)}`;
      }
      if (first !== undefined) return `Shopify error: ${String(first)}`;
    }
  }
  return `Shopify API error (HTTP ${status}).`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
