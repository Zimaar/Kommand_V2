import type { Tool } from "@anthropic-ai/sdk/resources/messages.js";
import type { PrimitiveResponse, PrimitiveName } from "@kommand/shared";
import type { PrimitiveDefinition } from "./types.js";
import { shopifyDef } from "./shopify.js";
import { xeroDef } from "./xero.js";
import { runCodeDef } from "./run-code.js";
import { webSearchDef } from "./web-search.js";
import { generateFileDef } from "./generate-file.js";
import { sendCommsDef } from "./send-comms.js";
import { memoryDef } from "./memory.js";

// ─── Registry ─────────────────────────────────────────────────────────────────

const primitiveRegistry = new Map<string, PrimitiveDefinition>();

function registerPrimitive(def: PrimitiveDefinition): void {
  if (primitiveRegistry.has(def.name)) {
    throw new Error(`Duplicate primitive registration: "${def.name}"`);
  }
  primitiveRegistry.set(def.name, def);
}

// Register all primitives
registerPrimitive(shopifyDef);
registerPrimitive(xeroDef);
registerPrimitive(runCodeDef);
registerPrimitive(webSearchDef);
registerPrimitive(generateFileDef);
registerPrimitive(sendCommsDef);
registerPrimitive(memoryDef);

// Primitives that are always available regardless of connected platforms
const ALWAYS_AVAILABLE: PrimitiveName[] = [
  "run_code",
  "web_search",
  "generate_file",
  "send_comms",
  "memory",
];

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns Claude tool definitions filtered by the tenant's connected platforms.
 * shopify_api is only included if the tenant has a Shopify store.
 * xero_api is only included if the tenant has a Xero connection.
 * run_code, web_search, generate_file, send_comms, memory are always included.
 */
export { type PrimitiveDefinition } from "./types.js";

export function getPrimitivesForClaude(connectedPlatforms: PrimitiveName[]): Tool[] {
  const available = new Set<string>(ALWAYS_AVAILABLE);
  for (const p of connectedPlatforms) {
    available.add(p);
  }

  const tools: Tool[] = [];
  for (const name of available) {
    const def = primitiveRegistry.get(name);
    if (def) {
      tools.push({
        name: def.name,
        description: def.description,
        input_schema: def.inputSchema,
      });
    } else if (!ALWAYS_AVAILABLE.includes(name as PrimitiveName)) {
      console.warn(`[primitives] Unknown platform primitive requested: "${name}"`);
    }
  }
  return tools;
}

/**
 * Execute a primitive by name.
 * - Validates that the primitive exists
 * - Calls the handler
 * - Never throws — wraps errors in PrimitiveResponse { success: false, error }
 * - Logs: primitive name, input summary (truncated), success/fail, latency
 */
export async function executePrimitive(
  name: string,
  input: unknown,
  tenantId: string,
  runId?: string
): Promise<PrimitiveResponse> {
  const def = primitiveRegistry.get(name);
  if (!def) {
    return { success: false, error: `Unknown primitive: ${name}` };
  }

  const startMs = Date.now();

  try {
    const result = await def.handler(input, tenantId, runId);
    const latencyMs = Date.now() - startMs;

    console.log(
      `[primitive] ${name} tenant=${tenantId} success=${result.success} latency=${latencyMs}ms`
    );

    return result;
  } catch (err) {
    const latencyMs = Date.now() - startMs;
    const message = err instanceof Error ? err.message : "Unknown error";

    console.error(
      `[primitive] ${name} tenant=${tenantId} success=false latency=${latencyMs}ms error=${message}`
    );

    return { success: false, error: `Primitive ${name} failed: ${message}` };
  }
}

// Alias for backward compat with agent/loop.ts
export const getPrimitiveDefinitions = getPrimitivesForClaude;
