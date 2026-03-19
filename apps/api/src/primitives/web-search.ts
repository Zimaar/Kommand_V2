import type { PrimitiveResponse } from "@kommand/shared";
import { WebSearchInputSchema } from "@kommand/shared";

// Uses Brave Search API — swap for Serper if preferred
const BRAVE_SEARCH_API = "https://api.search.brave.com/res/v1/web/search";

export async function webSearch(
  input: unknown,
  _tenantId: string
): Promise<PrimitiveResponse> {
  const parsed = WebSearchInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: `Invalid input: ${parsed.error.message}` };
  }

  const { action, query } = parsed.data;
  const apiKey = process.env["BRAVE_SEARCH_API_KEY"] ?? "";

  try {
    if (action === "search") {
      const url = new URL(BRAVE_SEARCH_API);
      url.searchParams.set("q", query);
      url.searchParams.set("count", "10");

      const res = await fetch(url.toString(), {
        headers: {
          "Accept": "application/json",
          "Accept-Encoding": "gzip",
          "X-Subscription-Token": apiKey,
        },
      });

      if (!res.ok) {
        return { success: false, error: `Search API error: ${res.status}` };
      }

      const data = await res.json() as {
        web?: {
          results?: Array<{
            title: string;
            url: string;
            description: string;
          }>;
        };
      };

      const results = data.web?.results?.map((r) => ({
        title: r.title,
        url: r.url,
        snippet: r.description,
      })) ?? [];

      return { success: true, data: { query, results } };
    }

    // fetch_url — get page content
    const res = await fetch(query, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Kommand-Agent/1.0)",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return { success: false, error: `Fetch failed: ${res.status} ${res.statusText}` };
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text")) {
      return { success: false, error: "URL does not return text content" };
    }

    const html = await res.text();
    // Basic HTML stripping — good enough for most pages
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim()
      .slice(0, 8000); // Cap at 8K chars

    return { success: true, data: { url: query, content: text } };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: `Web search failed: ${message}` };
  }
}
