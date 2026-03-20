import type { PrimitiveResponse } from "@kommand/shared";
import type { PrimitiveDefinition } from "./types.js";
import { MemoryInputSchema } from "@kommand/shared";
import { db } from "../db/connection.js";
import { memories } from "../db/schema.js";
import { generateEmbedding, searchMemories } from "../utils/embeddings.js";

export const memoryDef: PrimitiveDefinition = {
  name: "memory",
  description:
    "Read from or write to the business knowledge store. Use 'read' to search for relevant past observations, owner preferences, supplier info, seasonal patterns, or any previously stored knowledge. Use 'write' to store new observations about the business that will be useful in future interactions. Examples of what to remember: 'Owner prefers conservative pricing', 'Peak season is Nov-Dec', 'Main supplier is Al Noor Textiles, contact: ahmed@alnoor.ae', 'Average daily orders: 12-15'.",
  inputSchema: {
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
  handler: memoryHandler,
};

async function memoryHandler(
  input: unknown,
  tenantId: string,
  runId?: string
): Promise<PrimitiveResponse> {
  const parsed = MemoryInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: `Invalid input: ${parsed.error.message}` };
  }

  if (parsed.data.action === "write") {
    const embedding = await generateEmbedding(parsed.data.query);

    const [inserted] = await db
      .insert(memories)
      .values({
        tenantId,
        content: parsed.data.query,
        category: parsed.data.category ?? "observation",
        ...(runId ? { sourceRunId: runId } : {}),
        ...(embedding ? { embedding } : {}),
      })
      .returning({ id: memories.id });

    return { success: true, data: { stored: true, id: inserted!.id } };
  }

  // action === "read"
  const results = await searchMemories(tenantId, parsed.data.query);

  return {
    success: true,
    data: {
      memories: results.map((m) => ({
        content: m.content,
        category: m.category,
        createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : String(m.createdAt),
      })),
    },
  };
}
