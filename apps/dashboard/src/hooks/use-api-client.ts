"use client";

import { useCallback } from "react";
import { useAuth } from "@clerk/nextjs";

/**
 * Returns a stable `buildHeaders` function that injects the Clerk Bearer token
 * and x-tenant-id header into every API request.
 *
 * Using this hook instead of inline `authHeaders` means:
 *  1. No duplication of useAuth / API_URL across pages
 *  2. `buildHeaders` is stable (useCallback with [userId, getToken]) so it can
 *     safely appear in useCallback / useEffect dependency arrays without needing
 *     eslint-disable comments.
 */
export function useApiClient(): {
  buildHeaders: () => Promise<Record<string, string>>;
} {
  const { userId, getToken } = useAuth();

  const buildHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const token = await getToken();
    return {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(userId ? { "x-tenant-id": userId } : {}),
    };
  }, [userId, getToken]);

  return { buildHeaders };
}
