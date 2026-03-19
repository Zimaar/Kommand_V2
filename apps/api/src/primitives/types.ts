import type { Tool } from "@anthropic-ai/sdk/resources/messages.js";
import type { PrimitiveResponse, PrimitiveName } from "@kommand/shared";

export type PrimitiveInputSchema = Tool["input_schema"];

export interface PrimitiveDefinition {
  name: PrimitiveName;
  description: string;
  inputSchema: PrimitiveInputSchema;
  handler: (input: unknown, tenantId: string, runId?: string) => Promise<PrimitiveResponse>;
}
