import type { PrimitiveResponse } from "@kommand/shared";
import type { PrimitiveDefinition } from "./types.js";
import { ShopifyApiInputSchema } from "@kommand/shared";

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

// Mock — real implementation in M2
async function shopifyApi(input: unknown, _tenantId: string): Promise<PrimitiveResponse> {
  const parsed = ShopifyApiInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: `Invalid input: ${parsed.error.message}` };
  }

  return { success: true, data: { orders: [], products: [], customers: [] } };
}
