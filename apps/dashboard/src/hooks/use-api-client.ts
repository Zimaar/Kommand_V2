"use client";

import { useCallback } from "react";
import { useAuth } from "@clerk/nextjs";

const DEV_TENANT_REF =
  process.env.NEXT_PUBLIC_DEV_TENANT_REF ?? "clerk_dev_seed_raamiz";
const HAS_CLERK = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

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
function useClerkApiClient(): {
  buildHeaders: () => Promise<Record<string, string>>;
} {
  const { userId, getToken } = useAuth();

  const buildHeaders = useCallback(async (): Promise<Record<string, string>> => {
    let token = "";
    try {
      token = (await getToken()) ?? "";
    } catch {
      // In local dev we allow the dashboard to keep working without a fully
      // configured Clerk app by falling back to a seeded tenant reference.
    }

    const tenantRef = userId ?? DEV_TENANT_REF;
    return {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(tenantRef ? { "x-tenant-id": tenantRef } : {}),
    };
  }, [userId, getToken]);

  return { buildHeaders };
}

function useDevApiClient(): {
  buildHeaders: () => Promise<Record<string, string>>;
} {
  const buildHeaders = useCallback(async (): Promise<Record<string, string>> => {
    return {
      "Content-Type": "application/json",
      "x-tenant-id": DEV_TENANT_REF,
    };
  }, []);

  return { buildHeaders };
}

export const useApiClient = HAS_CLERK ? useClerkApiClient : useDevApiClient;
