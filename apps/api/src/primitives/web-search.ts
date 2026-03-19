import type { PrimitiveResponse } from "@kommand/shared";
import type { PrimitiveDefinition } from "./types.js";
import { WebSearchInputSchema } from "@kommand/shared";
import { config } from "../config.js";

// ─── Primitive definition ─────────────────────────────────────────────────────

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

// ─── Rate limiting ────────────────────────────────────────────────────────────
// 50 searches per tenant per calendar day (UTC). In-memory; swap for Redis in M8.

const DAILY_SEARCH_LIMIT = 50;
const searchCounts = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(tenantId: string): boolean {
  const now = Date.now();
  const entry = searchCounts.get(tenantId);

  // Reset window: midnight UTC of the next day
  if (!entry || entry.resetAt <= now) {
    const midnight = new Date();
    midnight.setUTCHours(24, 0, 0, 0);
    searchCounts.set(tenantId, { count: 1, resetAt: midnight.getTime() });
    return true;
  }

  if (entry.count >= DAILY_SEARCH_LIMIT) {
    return false;
  }

  entry.count++;
  return true;
}

// ─── HTML to text ─────────────────────────────────────────────────────────────

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTitle(html: string): string {
  const match = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
  return match?.[1]?.trim() ?? "";
}

// ─── Search via Serper ────────────────────────────────────────────────────────

interface SerperResult {
  title: string;
  link: string;
  snippet: string;
}

interface SerperResponse {
  organic?: Array<{ title?: string; link?: string; snippet?: string }>;
}

async function search(
  query: string,
  apiKey: string
): Promise<PrimitiveResponse> {
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ q: query, num: 5 }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    return {
      success: false,
      error: `Search API error (${res.status}): ${await res.text()}`,
    };
  }

  const body = (await res.json()) as SerperResponse;
  const results: SerperResult[] = (body.organic ?? []).slice(0, 5).map((r) => ({
    title: r.title ?? "",
    link: r.link ?? "",
    snippet: r.snippet ?? "",
  }));

  return { success: true, data: { results } };
}

// ─── Fetch URL ────────────────────────────────────────────────────────────────

async function fetchUrl(url: string): Promise<PrimitiveResponse> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Kommand/1.0)" },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: `Failed to fetch URL: ${message}` };
  }

  if (!res.ok) {
    return { success: false, error: `URL returned HTTP ${res.status}` };
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
    return {
      success: false,
      error: `URL returned non-text content type: ${contentType}`,
    };
  }

  const html = await res.text();
  const title = extractTitle(html);
  const content = htmlToText(html).slice(0, 8000);

  return { success: true, data: { url, title, content } };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

async function webSearch(
  input: unknown,
  tenantId: string
): Promise<PrimitiveResponse> {
  const parsed = WebSearchInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: `Invalid input: ${parsed.error.message}` };
  }

  const { action, query } = parsed.data;

  // fetch_url doesn't count against the search quota
  if (action === "fetch_url") {
    return fetchUrl(query);
  }

  // search — check rate limit first
  if (!checkRateLimit(tenantId)) {
    return {
      success: false,
      error: "Daily web search limit reached (50/day). Try again tomorrow.",
    };
  }

  const apiKey = config.SERPER_API_KEY;
  if (!apiKey) {
    return { success: false, error: "Web search is not configured." };
  }

  return search(query, apiKey);
}
