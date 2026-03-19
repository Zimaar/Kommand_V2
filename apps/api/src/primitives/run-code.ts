import { config } from "../config.js";
import type { PrimitiveResponse } from "@kommand/shared";
import { RunCodeInputSchema } from "@kommand/shared";
import { uploadFile } from "./generate-file.js";

interface E2BFile {
  name: string;
  path: string;
}

interface E2BRunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  files: E2BFile[];
}

// E2B REST API — creates a sandbox, runs code, tears it down
async function runInE2BSandbox(code: string): Promise<E2BRunResult> {
  const headers = {
    "X-API-Key": config.E2B_API_KEY,
    "Content-Type": "application/json",
  };

  // Create sandbox
  const createRes = await fetch("https://api.e2b.dev/sandboxes", {
    method: "POST",
    headers,
    body: JSON.stringify({ template: "Python3-DataAnalysis", timeout: 60 }),
  });

  if (!createRes.ok) {
    throw new Error(`E2B sandbox creation failed: ${createRes.status}`);
  }

  const sandbox = await createRes.json() as { sandboxId: string };
  const sandboxId = sandbox.sandboxId;

  try {
    // Run the code
    const runRes = await fetch(`https://api.e2b.dev/sandboxes/${sandboxId}/process`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        cmd: "python3",
        args: ["-c", code],
        timeout: 30,
      }),
    });

    if (!runRes.ok) {
      throw new Error(`E2B run failed: ${runRes.status}`);
    }

    const runResult = await runRes.json() as {
      stdout: string;
      stderr: string;
      exitCode: number;
    };

    // List files in /tmp/
    const filesRes = await fetch(`https://api.e2b.dev/sandboxes/${sandboxId}/filesystem/list?path=/tmp`, {
      headers,
    });

    let files: E2BFile[] = [];
    if (filesRes.ok) {
      const filesData = await filesRes.json() as { entries?: Array<{ name: string; path: string }> };
      files = (filesData.entries ?? []).filter((f) => !f.name.startsWith("."));
    }

    // Download any generated files
    const downloadedFiles: E2BFile[] = [];
    for (const file of files) {
      downloadedFiles.push({ name: file.name, path: file.path });
    }

    return {
      stdout: runResult.stdout,
      stderr: runResult.stderr,
      exitCode: runResult.exitCode,
      files: downloadedFiles,
    };
  } finally {
    // Always kill the sandbox
    await fetch(`https://api.e2b.dev/sandboxes/${sandboxId}`, {
      method: "DELETE",
      headers,
    }).catch(() => {});
  }
}

export async function runCode(
  input: unknown,
  tenantId: string,
  runId?: string
): Promise<PrimitiveResponse> {
  const parsed = RunCodeInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: `Invalid input: ${parsed.error.message}` };
  }

  try {
    const result = await runInE2BSandbox(parsed.data.code);

    if (result.exitCode !== 0 && result.stderr) {
      return {
        success: false,
        error: `Code execution failed (exit ${result.exitCode}): ${result.stderr.slice(0, 1000)}`,
      };
    }

    // Upload generated files to Supabase Storage
    const fileLinks: Array<{ filename: string; url: string; contentType: string }> = [];

    for (const file of result.files) {
      try {
        // Download file content from sandbox
        const contentRes = await fetch(
          `https://api.e2b.dev/sandboxes/${file.path}`,
          { headers: { "X-API-Key": config.E2B_API_KEY } }
        );
        if (contentRes.ok) {
          const buffer = Buffer.from(await contentRes.arrayBuffer());
          const contentType = guessContentType(file.name);
          const url = await uploadFile(buffer, file.name, contentType, tenantId, runId);
          fileLinks.push({ filename: file.name, url, contentType });
        }
      } catch {
        // Non-fatal: file upload failure shouldn't fail the whole run
      }
    }

    return {
      success: true,
      data: {
        stdout: result.stdout,
        stderr: result.stderr || undefined,
        files: fileLinks,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: `Code execution failed: ${message}` };
  }
}

function guessContentType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    csv: "text/csv",
    json: "application/json",
    txt: "text/plain",
  };
  return (ext && map[ext]) ?? "application/octet-stream";
}
