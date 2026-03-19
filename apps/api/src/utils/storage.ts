import { lt, eq, inArray } from "drizzle-orm";
import { config } from "../config.js";
import { db } from "../db/connection.js";
import { generatedFiles } from "../db/schema.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UploadedFile {
  url: string;
  storagePath: string;
}

// ─── Upload ───────────────────────────────────────────────────────────────────

/**
 * Upload a file to Supabase Storage and record it in generated_files.
 *
 * Storage path: {tenantId}/agent_runs/{timestamp}_{filename}
 * Returns a 24-hour signed URL.
 *
 * Throws if upload or URL signing fails.
 */
export async function uploadFile(
  tenantId: string,
  filename: string,
  content: Uint8Array,
  contentType: string,
  agentRunId?: string | null
): Promise<UploadedFile> {
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_STORAGE_BUCKET } = config;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error("Supabase storage is not configured.");
  }

  const storagePath = `${tenantId}/agent_runs/${Date.now()}_${filename}`;

  // Upload object
  const uploadRes = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${SUPABASE_STORAGE_BUCKET}/${storagePath}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        apikey: SUPABASE_SERVICE_KEY,
        "Content-Type": contentType,
      },
      body: content,
    }
  );
  if (!uploadRes.ok) {
    throw new Error(`Storage upload failed (${uploadRes.status}): ${await uploadRes.text()}`);
  }

  // Generate signed URL (24 hours)
  const signRes = await fetch(
    `${SUPABASE_URL}/storage/v1/object/sign/${SUPABASE_STORAGE_BUCKET}/${storagePath}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        apikey: SUPABASE_SERVICE_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expiresIn: 86400 }),
    }
  );
  if (!signRes.ok) {
    throw new Error(`URL signing failed (${signRes.status}): ${await signRes.text()}`);
  }

  const { signedURL } = (await signRes.json()) as { signedURL: string };
  const url = `${SUPABASE_URL}/storage/v1${signedURL}`;
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  // Record in DB
  await db.insert(generatedFiles).values({
    tenantId,
    agentRunId: agentRunId ?? null,
    filename,
    storagePath,
    downloadUrl: url,
    contentType,
    sizeBytes: content.length,
    expiresAt,
  });

  return { url, storagePath };
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

/**
 * Delete expired files from Supabase Storage and the generated_files table.
 * Intended to run as a daily cron job.
 *
 * Returns the number of files deleted.
 */
export async function deleteExpiredFiles(): Promise<number> {
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_STORAGE_BUCKET } = config;

  const now = new Date();

  const expired = await db
    .select({ id: generatedFiles.id, storagePath: generatedFiles.storagePath })
    .from(generatedFiles)
    .where(lt(generatedFiles.expiresAt, now));

  if (expired.length === 0) return 0;

  // Batch-delete from Supabase Storage
  if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
    const prefixes = expired.map((f) => f.storagePath);
    const delRes = await fetch(
      `${SUPABASE_URL}/storage/v1/object/${SUPABASE_STORAGE_BUCKET}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          apikey: SUPABASE_SERVICE_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prefixes }),
      }
    );
    if (!delRes.ok) {
      console.error(
        `[storage] Batch storage delete failed (${delRes.status}): ${await delRes.text()}`
      );
      // Continue to purge DB records regardless
    }
  }

  // Delete DB records
  const ids = expired.map((f) => f.id);
  await db.delete(generatedFiles).where(inArray(generatedFiles.id, ids));

  console.log(`[storage] Deleted ${ids.length} expired files`);
  return ids.length;
}
