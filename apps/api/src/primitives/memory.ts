import Anthropic from "@anthropic-ai/sdk";
import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "../db/connection.js";
import { memories } from "../db/schema.js";
import { config } from "../config.js";
import type { PrimitiveResponse } from "@kommand/shared";
import { MemoryInputSchema } from "@kommand/shared";

const anthropic = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;

async function embed(text: string): Promise<number[]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env["OPENAI_API_KEY"] ?? ""}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text,
      dimensions: EMBEDDING_DIMENSIONS,
    }),
  });

  if (!res.ok) {
    throw new Error(`Embedding API failed: ${res.status}`);
  }

  const data = await res.json() as { data: Array<{ embedding: number[] }> };
  return data.data[0]?.embedding ?? [];
}

export async function memory(
  input: unknown,
  tenantId: string,
  runId?: string
): Promise<PrimitiveResponse> {
  const parsed = MemoryInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: `Invalid input: ${parsed.error.message}` };
  }

  const { action, query, category } = parsed.data;

  try {
    if (action === "write") {
      let embedding: number[] | null = null;
      try {
        embedding = await embed(query);
      } catch {
        // Proceed without embedding — full-text fallback
      }

      await db.insert(memories).values({
        tenantId,
        content: query,
        category: category ?? "observation",
        embedding: embedding ?? undefined,
        sourceRunId: runId ?? null,
        isActive: true,
      });

      return { success: true, data: { stored: true, content: query } };
    }

    // read — similarity search if embeddings available, else recency fallback
    let embedding: number[] | null = null;
    try {
      embedding = await embed(query);
    } catch {
      // Fallback to recency
    }

    let rows;
    if (embedding && embedding.length > 0) {
      // pgvector similarity search
      const vectorStr = `[${embedding.join(",")}]`;
      rows = await db.execute(
        sql`
          SELECT id, content, category, created_at
          FROM memories
          WHERE tenant_id = ${tenantId}
            AND is_active = true
          ORDER BY embedding <=> ${vectorStr}::vector
          LIMIT 10
        `
      );
    } else {
      // Recency fallback
      rows = await db
        .select({
          id: memories.id,
          content: memories.content,
          category: memories.category,
          createdAt: memories.createdAt,
        })
        .from(memories)
        .where(and(eq(memories.tenantId, tenantId), eq(memories.isActive, true)))
        .orderBy(desc(memories.createdAt))
        .limit(10);
    }

    return {
      success: true,
      data: {
        query,
        results: Array.isArray(rows) ? rows : (rows as { rows: unknown[] }).rows,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: `Memory operation failed: ${message}` };
  }
}
