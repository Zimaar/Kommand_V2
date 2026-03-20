/**
 * Sanitize agent output before it leaves the system.
 *
 * Strips:
 * - <business_data> XML blocks in case the agent accidentally echoes them
 * - Any remaining HTML/XML tags (shouldn't appear in WhatsApp output)
 * - Null bytes and non-printable control characters (preserves \n, \t, \r)
 *
 * This is the output sanitization layer described in SECURITY.md — a defence-in-depth
 * measure against prompt-injection content leaking into messages sent to the owner.
 */
export function sanitizeOutput(text: string): string {
  return text
    .replace(/<business_data[^>]*>[\s\S]*?<\/business_data>/gi, "")
    .replace(/<\/?[a-zA-Z][^>]*>/g, "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
}

/**
 * Format text for WhatsApp:
 * - Sanitizes output (strips injection artefacts, control chars)
 * - **bold** → *bold*  (Markdown bold → WhatsApp bold)
 * - `code` → ```code```  (inline code spans only; existing triple-backtick fences pass through unchanged)
 * - Truncates to 4096 chars (WhatsApp text message limit)
 */
export function formatForWhatsApp(text: string): string {
  let result = sanitizeOutput(text)
    .replace(/\*\*(.+?)\*\*/gs, "*$1*")
    .replace(/(?<!`)`([^`]+)`(?!`)/g, "```$1```");

  if (result.length > 4096) {
    result = result.slice(0, 4093) + "...";
  }
  return result;
}

/** Extract a display filename from a file URL, stripping query strings. */
export function fileUrlToFilename(url: string): string {
  return url.split("?")[0]?.split("/").pop() ?? "file";
}
