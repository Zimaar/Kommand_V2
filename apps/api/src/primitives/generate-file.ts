import { config } from "../config.js";
import { db } from "../db/connection.js";
import { generatedFiles } from "../db/schema.js";
import type { PrimitiveResponse } from "@kommand/shared";
import { GenerateFileInputSchema } from "@kommand/shared";

const FILE_EXPIRY_HOURS = 24;

export async function uploadFile(
  content: Buffer,
  filename: string,
  contentType: string,
  tenantId: string,
  runId?: string
): Promise<string> {
  const storagePath = `${tenantId}/${Date.now()}-${filename}`;
  const uploadUrl = `${config.SUPABASE_URL}/storage/v1/object/${config.SUPABASE_STORAGE_BUCKET}/${storagePath}`;

  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.SUPABASE_SERVICE_KEY}`,
      "Content-Type": contentType,
      "x-upsert": "true",
    },
    body: content,
  });

  if (!res.ok) {
    throw new Error(`Storage upload failed: ${res.status} ${await res.text()}`);
  }

  // Create a signed URL valid for 24 hours
  const signedUrlRes = await fetch(
    `${config.SUPABASE_URL}/storage/v1/object/sign/${config.SUPABASE_STORAGE_BUCKET}/${storagePath}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expiresIn: FILE_EXPIRY_HOURS * 3600 }),
    }
  );

  if (!signedUrlRes.ok) {
    throw new Error(`Failed to create signed URL: ${signedUrlRes.status}`);
  }

  const signedData = await signedUrlRes.json() as { signedURL: string };
  const downloadUrl = `${config.SUPABASE_URL}/storage/v1${signedData.signedURL}`;

  // Record in DB
  await db.insert(generatedFiles).values({
    tenantId,
    agentRunId: runId ?? null,
    filename,
    storagePath,
    downloadUrl,
    contentType,
    sizeBytes: content.length,
    expiresAt: new Date(Date.now() + FILE_EXPIRY_HOURS * 3600 * 1000),
  });

  return downloadUrl;
}

export async function generateFile(
  input: unknown,
  tenantId: string,
  runId?: string
): Promise<PrimitiveResponse> {
  const parsed = GenerateFileInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: `Invalid input: ${parsed.error.message}` };
  }

  const { filename, content, content_type } = parsed.data;

  try {
    const buffer = Buffer.from(content, "utf-8");
    const url = await uploadFile(buffer, filename, content_type, tenantId, runId);

    return {
      success: true,
      data: {
        filename,
        url,
        expiresIn: `${FILE_EXPIRY_HOURS} hours`,
        sizeBytes: buffer.length,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: `File generation failed: ${message}` };
  }
}
