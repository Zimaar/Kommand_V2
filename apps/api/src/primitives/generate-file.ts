import type { PrimitiveResponse } from "@kommand/shared";
import type { PrimitiveDefinition } from "./types.js";
import { GenerateFileInputSchema } from "@kommand/shared";
import { config } from "../config.js";
import { uploadFile } from "../utils/storage.js";

export const generateFileDef: PrimitiveDefinition = {
  name: "generate_file",
  description:
    "Generate a simple downloadable text/CSV/JSON/Markdown file. For complex files (PDF reports, PPTX decks, XLSX spreadsheets with charts), use run_code instead and save to /tmp/. This primitive is for simple text-based file generation.",
  inputSchema: {
    type: "object",
    properties: {
      filename: { type: "string" },
      content: { type: "string" },
      content_type: {
        type: "string",
        enum: ["text/plain", "text/csv", "application/json", "text/markdown"],
      },
    },
    required: ["filename", "content", "content_type"],
  },
  handler: generateFile,
};

async function generateFile(
  input: unknown,
  tenantId: string,
  runId?: string
): Promise<PrimitiveResponse> {
  const parsed = GenerateFileInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: `Invalid input: ${parsed.error.message}` };
  }

  const { filename, content, content_type } = parsed.data;

  if (!config.SUPABASE_URL || !config.SUPABASE_SERVICE_KEY) {
    // Dev fallback — return the content inline
    return {
      success: true,
      data: {
        url: "",
        filename,
        note: "File storage not configured. Content preview: " + content.slice(0, 200),
      },
    };
  }

  try {
    const contentBytes = new TextEncoder().encode(content);
    const { url } = await uploadFile(tenantId, filename, contentBytes, content_type, runId);
    return { success: true, data: { url, filename } };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: `File generation failed: ${message}` };
  }
}
