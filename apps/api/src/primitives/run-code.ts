import type { PrimitiveResponse } from "@kommand/shared";
import type { PrimitiveDefinition } from "./types.js";
import { RunCodeInputSchema } from "@kommand/shared";

export const runCodeDef: PrimitiveDefinition = {
  name: "run_code",
  description:
    "Execute Python code in a sandboxed environment. Pre-installed packages: pandas, numpy, matplotlib, seaborn, reportlab, openpyxl, python-pptx, Pillow, scipy, scikit-learn, requests. Use this for ALL data analysis, chart generation, computations, forecasting, and report building. The code runs in an isolated container. You can write files to /tmp/ and they will be available for download. Return data by printing to stdout. For charts, save to /tmp/chart.png. For reports, save to /tmp/report.pdf.",
  inputSchema: {
    type: "object",
    properties: {
      code: {
        type: "string",
        description:
          "Python code to execute. Print results to stdout. Save files to /tmp/.",
      },
    },
    required: ["code"],
  },
  handler: runCode,
};

// Mock — real implementation in M4
async function runCode(input: unknown, _tenantId: string): Promise<PrimitiveResponse> {
  const parsed = RunCodeInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: `Invalid input: ${parsed.error.message}` };
  }

  return { success: true, data: { stdout: "mock output", files: [] } };
}
