import { eq, and } from "drizzle-orm";
import { db } from "../db/connection.js";
import { stores } from "../db/schema.js";
import { decryptToken } from "../auth/encryption.js";
import type { PrimitiveResponse } from "@kommand/shared";
import { ShopifyApiInputSchema } from "@kommand/shared";

const SHOPIFY_API_VERSION = "2024-10";

export async function shopifyApi(
  input: unknown,
  tenantId: string
): Promise<PrimitiveResponse> {
  const parsed = ShopifyApiInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: `Invalid input: ${parsed.error.message}` };
  }

  const { method, query, variables } = parsed.data;

  // Get the first active store for this tenant
  const storeRows = await db
    .select()
    .from(stores)
    .where(
      and(
        eq(stores.tenantId, tenantId),
        eq(stores.platform, "shopify"),
        eq(stores.isActive, true)
      )
    )
    .limit(1);

  const store = storeRows[0];
  if (!store) {
    return { success: false, error: "No Shopify store connected. Please connect your store via the dashboard." };
  }

  let accessToken: string;
  try {
    accessToken = decryptToken(store.accessTokenEnc, store.tokenIv, store.tokenTag);
  } catch {
    return { success: false, error: "Failed to decrypt Shopify credentials. Please reconnect your store." };
  }

  const baseUrl = `https://${store.domain}/admin/api/${SHOPIFY_API_VERSION}`;

  try {
    if (method === "graphql") {
      const res = await fetch(`${baseUrl}/graphql.json`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
        },
        body: JSON.stringify({ query, variables }),
      });

      if (!res.ok) {
        return { success: false, error: `Shopify API error: ${res.status} ${res.statusText}` };
      }

      const data = await res.json() as { errors?: unknown; data?: unknown };
      if (data.errors) {
        return { success: false, error: `Shopify GraphQL error: ${JSON.stringify(data.errors)}` };
      }
      return { success: true, data: data.data };
    }

    // REST methods
    const httpMethod = method.replace("rest_", "").toUpperCase();
    const url = `${baseUrl}${query.startsWith("/") ? query : `/${query}`}`;

    const res = await fetch(url, {
      method: httpMethod,
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: variables && httpMethod !== "GET" ? JSON.stringify(variables) : undefined,
    });

    if (!res.ok) {
      return { success: false, error: `Shopify API error: ${res.status} ${res.statusText}` };
    }

    const data = await res.json();
    return { success: true, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: `Shopify request failed: ${message}` };
  }
}
