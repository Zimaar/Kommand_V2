import OpenAI from "openai";
import { and, desc, eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { config, MEMORY_RETRIEVAL_COUNT } from "../config.js";
import { db } from "../db/connection.js";
import { memories } from "../db/schema.js";
import type { MemoryEntry } from "@kommand/shared";

let openaiClient: OpenAI | null = null;

function getClient(): OpenAI | null {
  if (!config.OPENAI_API_KEY) return null;
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: config.OPENAI_API_KEY });
  }
  return openaiClient;
}

export async function generateEmbedding(text: string): Promise<number[] | null> {
  const client = getClient();
  if (!client) return null;

  try {
    const response = await client.embeddings.create({
      model: "text-embedding-3-small",
      input: text,
    });
    return response.data[0]?.embedding ?? null;
  } catch (err) {
    console.error(
      "[embeddings] Failed to generate embedding:",
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

/**
 * Search memories for a tenant using vector similarity if an embedding can be
 * generated, otherwise fall back to recency order.
 */
export async function searchMemories(
  tenantId: string,
  query: string,
  limit: number = MEMORY_RETRIEVAL_COUNT
): Promise<MemoryEntry[]> {
  const embedding = await generateEmbedding(query);

  if (embedding) {
    const vectorStr = `[${embedding.join(",")}]`;
    const result = await db.execute<{
      id: string;
      content: string;
      category: string;
      created_at: string;
    }>(
      sql`SELECT id, content, category, created_at
          FROM memories
          WHERE tenant_id = ${tenantId} AND is_active = true
          ORDER BY embedding <=> ${vectorStr}::vector
          LIMIT ${limit}`
    );
    return result.rows.map((r) => ({
      id: r.id,
      content: r.content,
      category: r.category as MemoryEntry["category"],
      createdAt: new Date(r.created_at),
    }));
  }

  // Fallback: recency order (no embedding available)
  const rows = await db
    .select({
      id: memories.id,
      content: memories.content,
      category: memories.category,
      createdAt: memories.createdAt,
    })
    .from(memories)
    .where(and(eq(memories.tenantId, tenantId), eq(memories.isActive, true)))
    .orderBy(desc(memories.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    content: r.content,
    category: r.category as MemoryEntry["category"],
    createdAt: r.createdAt,
  }));
}
