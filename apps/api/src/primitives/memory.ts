import type { PrimitiveResponse } from "@kommand/shared";
import type { PrimitiveDefinition } from "./types.js";
import { MemoryInputSchema } from "@kommand/shared";

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

// Mock — real implementation in M6
async function memoryHandler(input: unknown, _tenantId: string): Promise<PrimitiveResponse> {
  const parsed = MemoryInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: `Invalid input: ${parsed.error.message}` };
  }

  if (parsed.data.action === "write") {
    return { success: true, data: { stored: true, id: "mock-memory-id" } };
  }

  return {
    success: true,
    data: {
      memories: [
        { content: "Mock memory entry", category: "observation", createdAt: new Date().toISOString() },
      ],
    },
  };
}
