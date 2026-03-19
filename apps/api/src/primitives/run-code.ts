import { Sandbox, TimeoutError, FileType } from "@e2b/code-interpreter";
import type { PrimitiveResponse } from "@kommand/shared";
import type { PrimitiveDefinition } from "./types.js";
import { RunCodeInputSchema } from "@kommand/shared";
import { config } from "../config.js";
import { uploadFile } from "../utils/storage.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const EXTRA_PACKAGES = "reportlab openpyxl python-pptx Pillow";
const EXECUTION_TIMEOUT_MS = 30_000;
const INSTALL_TIMEOUT_MS = 60_000;

// ─── Primitive definition ─────────────────────────────────────────────────────

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function inferContentType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const types: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    svg: "image/svg+xml",
    pdf: "application/pdf",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    csv: "text/csv",
    txt: "text/plain",
    json: "application/json",
  };
  return types[ext] ?? "application/octet-stream";
}

// ─── Sandbox execution (one attempt) ──────────────────────────────────────────

/**
 * Creates a sandbox, installs extra packages, runs the code, and returns
 * the stdout, tmp files, and any Python-level error.
 *
 * Returns a PrimitiveResponse for all expected outcomes (success, Python error,
 * timeout). Throws only for unexpected E2B API failures so the caller can retry.
 */
async function runInSandbox(
  code: string,
  e2bKey: string,
  tenantId: string,
  runId: string | undefined
): Promise<PrimitiveResponse> {
  // Throws on E2B API failure (network, auth, quota) — caller handles retry
  const sandbox = await Sandbox.create({ apiKey: e2bKey });

  try {
    // Install packages not in the default E2B template
    await sandbox.commands.run(`pip install -q ${EXTRA_PACKAGES}`, {
      timeoutMs: INSTALL_TIMEOUT_MS,
    });

    // Execute user code
    let execution;
    try {
      execution = await sandbox.runCode(code, { timeoutMs: EXECUTION_TIMEOUT_MS });
    } catch (err) {
      if (err instanceof TimeoutError) {
        return { success: false, error: "Code execution timed out after 30 seconds." };
      }
      throw err; // unexpected E2B error — rethrow for retry
    }

    // Python-level error (syntax, runtime, etc.)
    if (execution.error) {
      const errMsg = execution.error.value || execution.logs.stderr.join("\n") || "Code execution failed.";
      return { success: false, error: errMsg };
    }

    const stdout = execution.logs.stdout.join("\n");

    // Collect files written to /tmp/
    let tmpEntries: Array<{ name: string; path: string }> = [];
    try {
      const entries = await sandbox.files.list("/tmp");
      tmpEntries = entries
        .filter((e) => e.type === FileType.FILE)
        .map((e) => ({ name: e.name, path: e.path }));
    } catch {
      // /tmp listing failed or empty — not critical
    }

    // Upload each file to Supabase and record in DB
    const files: Array<{ url: string; filename: string; contentType: string }> = [];
    const storageAvailable = Boolean(config.SUPABASE_URL && config.SUPABASE_SERVICE_KEY);

    for (const { name, path } of tmpEntries) {
      try {
        const contentBytes = await sandbox.files.read(path, { format: "bytes" });
        const contentType = inferContentType(name);

        if (!storageAvailable) {
          // Dev mode: surface file name without upload
          files.push({ url: "", filename: name, contentType });
          continue;
        }

        const { url } = await uploadFile(tenantId, name, contentBytes, contentType, runId);
        files.push({ url, filename: name, contentType });
      } catch (fileErr) {
        console.error(`[run-code] Failed to process file "${path}":`, fileErr);
        // Continue — partial file upload failure shouldn't block the run
      }
    }

    return { success: true, data: { stdout, files } };
  } finally {
    sandbox.kill().catch(() => undefined);
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

async function runCode(
  input: unknown,
  tenantId: string,
  runId?: string
): Promise<PrimitiveResponse> {
  const parsed = RunCodeInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: `Invalid input: ${parsed.error.message}` };
  }

  const e2bKey = config.E2B_API_KEY;
  if (!e2bKey) {
    return { success: false, error: "Code execution is not configured." };
  }

  // First attempt
  try {
    return await runInSandbox(parsed.data.code, e2bKey, tenantId, runId);
  } catch (err) {
    console.error("[run-code] E2B attempt 1 failed, retrying:", err);
  }

  // Second attempt
  try {
    return await runInSandbox(parsed.data.code, e2bKey, tenantId, runId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: `Code execution failed: ${message}` };
  }
}
