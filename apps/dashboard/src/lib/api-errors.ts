export function getApiErrorMessage(payload: unknown, fallback: string): string {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  if (!payload || typeof payload !== "object") {
    return fallback;
  }

  const data = payload as Record<string, unknown>;

  if (typeof data.message === "string" && data.message.trim()) {
    return data.message;
  }

  const nested = data.error;
  if (typeof nested === "string" && nested.trim()) {
    return nested;
  }

  if (nested && typeof nested === "object") {
    const nestedMessage = (nested as Record<string, unknown>).message;
    if (typeof nestedMessage === "string" && nestedMessage.trim()) {
      return nestedMessage;
    }
  }

  return fallback;
}
