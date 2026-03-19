/**
 * Format text for WhatsApp:
 * - **bold** → *bold*  (Markdown bold → WhatsApp bold)
 * - `code` → ```code```  (inline code spans only; existing triple-backtick fences pass through unchanged)
 * - Truncates to 4096 chars (WhatsApp text message limit)
 */
export function formatForWhatsApp(text: string): string {
  let result = text
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
