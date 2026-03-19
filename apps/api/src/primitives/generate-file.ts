import type { PrimitiveResponse } from "@kommand/shared";
import type { PrimitiveDefinition } from "./types.js";
import { GenerateFileInputSchema } from "@kommand/shared";

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

// Mock — real implementation in M4
async function generateFile(input: unknown, _tenantId: string): Promise<PrimitiveResponse> {
  const parsed = GenerateFileInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: `Invalid input: ${parsed.error.message}` };
  }

  return {
    success: true,
    data: {
      url: "https://mock.storage/files/mock-file.csv",
      filename: parsed.data.filename,
    },
  };
}
