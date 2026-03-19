import type { PrimitiveResponse } from "@kommand/shared";
import type { PrimitiveDefinition } from "./types.js";
import { XeroApiInputSchema } from "@kommand/shared";

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

// Mock — real implementation in M7
async function xeroApi(input: unknown, _tenantId: string): Promise<PrimitiveResponse> {
  const parsed = XeroApiInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: `Invalid input: ${parsed.error.message}` };
  }

  return { success: true, data: { invoices: [], contacts: [], reports: [] } };
}
