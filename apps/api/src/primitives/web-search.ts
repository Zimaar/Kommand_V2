import type { PrimitiveResponse } from "@kommand/shared";
import type { PrimitiveDefinition } from "./types.js";
import { WebSearchInputSchema } from "@kommand/shared";

export const webSearchDef: PrimitiveDefinition = {
  name: "web_search",
  description:
    "Search the web or fetch a specific URL. Use for: competitor research, finding product images, checking market prices, looking up shipping rates, finding supplier info, or any question that needs current internet data.",
  inputSchema: {
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
  handler: webSearch,
};

// Mock — real implementation in M4
async function webSearch(input: unknown, _tenantId: string): Promise<PrimitiveResponse> {
  const parsed = WebSearchInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: `Invalid input: ${parsed.error.message}` };
  }

  return {
    success: true,
    data: {
      results: [
        { title: "Mock result", url: "https://example.com", snippet: "Mock search result" },
      ],
    },
  };
}
