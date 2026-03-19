import type { Tool } from "@anthropic-ai/sdk/resources/messages.js";
import type { PrimitiveResponse, PrimitiveName } from "@kommand/shared";
import { shopifyApi } from "./shopify.js";
import { xeroApi } from "./xero.js";
import { runCode } from "./run-code.js";
import { webSearch } from "./web-search.js";
import { generateFile } from "./generate-file.js";
import { sendComms, executeSendComms } from "./send-comms.js";
import { memory } from "./memory.js";

// Claude tool definitions
const PRIMITIVE_DEFINITIONS: Record<PrimitiveName, Tool> = {
  shopify_api: {
    name: "shopify_api",
    description:
      "Execute a Shopify Admin API request against the owner's store. You can run any GraphQL query or mutation, or any REST API call. Use this to read orders, products, customers, inventory, analytics — and to create refunds, discounts, fulfillments, or any other write operation. You write the query. Shopify API version: 2024-10.",
    input_schema: {
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
  },

  xero_api: {
    name: "xero_api",
    description:
      "Execute a Xero API request against the owner's accounting org. You construct the endpoint path and request body. Use this for invoices, bills, contacts, bank transactions, reports (P&L, balance sheet, aged receivables), and any other Xero operation. Base URL is https://api.xero.com/api.xro/2.0/. You provide the path after that.",
    input_schema: {
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
  },

  run_code: {
    name: "run_code",
    description:
      "Execute Python code in a sandboxed environment. Pre-installed packages: pandas, numpy, matplotlib, seaborn, reportlab, openpyxl, python-pptx, Pillow, scipy, scikit-learn, requests. Use this for ALL data analysis, chart generation, computations, forecasting, and report building. The code runs in an isolated container. You can write files to /tmp/ and they will be available for download. Return data by printing to stdout. For charts, save to /tmp/chart.png. For reports, save to /tmp/report.pdf.",
    input_schema: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description:
            "Python code to execute. Print results to stdout. Save files to /tmp/.",
        },
      },
      required: ["code"],
    },
  },

  web_search: {
    name: "web_search",
    description:
      "Search the web or fetch a specific URL. Use for: competitor research, finding product images, checking market prices, looking up shipping rates, finding supplier info, or any question that needs current internet data.",
    input_schema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["search", "fetch_url"],
        },
        query: {
          type: "string",
          description:
            "For search: the search query. For fetch_url: the full URL to fetch.",
        },
      },
      required: ["action", "query"],
    },
  },

  generate_file: {
    name: "generate_file",
    description:
      "Generate a simple downloadable text/CSV/JSON/Markdown file. For complex files (PDF reports, PPTX decks, XLSX spreadsheets with charts), use run_code instead and save to /tmp/. This primitive is for simple text-based file generation.",
    input_schema: {
      type: "object",
      properties: {
        filename: { type: "string" },
        content: { type: "string" },
        content_type: {
          type: "string",
          enum: ["text/plain", "text/csv", "application/json", "text/markdown"],
        },
      },
      required: ["filename", "content"],
    },
  },

  send_comms: {
    name: "send_comms",
    description:
      "Send a message to someone on the owner's behalf. This could be a WhatsApp message to a customer, an email to a supplier, or an invoice reminder. IMPORTANT: You MUST show the owner a preview of the message and get their explicit confirmation before calling this primitive. Never send without approval. This call will store the draft and prompt for confirmation.",
    input_schema: {
      type: "object",
      properties: {
        channel: {
          type: "string",
          enum: ["whatsapp", "email"],
        },
        to: {
          type: "string",
          description: "Phone number (E.164) for WhatsApp, email address for email.",
        },
        subject: {
          type: "string",
          description: "Email subject line. Not used for WhatsApp.",
        },
        body: {
          type: "string",
          description: "Message body.",
        },
      },
      required: ["channel", "to", "body"],
    },
  },

  memory: {
    name: "memory",
    description:
      "Read from or write to the business knowledge store. Use 'read' to search for relevant past observations, owner preferences, supplier info, seasonal patterns, or any previously stored knowledge. Use 'write' to store new observations about the business that will be useful in future interactions. Examples of what to remember: 'Owner prefers conservative pricing', 'Peak season is Nov-Dec', 'Main supplier is Al Noor Textiles, contact: ahmed@alnoor.ae', 'Average daily orders: 12-15'.",
    input_schema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["read", "write"],
        },
        query: {
          type: "string",
          description:
            "For read: natural language search query to find relevant memories. For write: the observation or fact to store.",
        },
        category: {
          type: "string",
          enum: ["preference", "pattern", "contact", "decision", "observation", "workflow"],
          description: "Category of the memory being stored. Only used for write.",
        },
      },
      required: ["action", "query"],
    },
  },
};

export function getPrimitiveDefinitions(connectedPlatforms: PrimitiveName[]): Tool[] {
  return connectedPlatforms.map((name) => PRIMITIVE_DEFINITIONS[name]).filter(Boolean) as Tool[];
}

export async function executePrimitive(
  name: string,
  input: Record<string, unknown>,
  tenantId: string,
  runId?: string
): Promise<PrimitiveResponse> {
  switch (name) {
    case "shopify_api":
      return await shopifyApi(input, tenantId);
    case "xero_api":
      return await xeroApi(input, tenantId);
    case "run_code":
      return await runCode(input, tenantId, runId);
    case "web_search":
      return await webSearch(input, tenantId);
    case "generate_file":
      return await generateFile(input, tenantId, runId);
    case "send_comms":
      return await sendComms(input, tenantId, runId);
    case "send_comms_execute":
      return await executeSendComms(input, tenantId);
    case "memory":
      return await memory(input, tenantId, runId);
    default:
      return { success: false, error: `Unknown primitive: ${name}` };
  }
}
