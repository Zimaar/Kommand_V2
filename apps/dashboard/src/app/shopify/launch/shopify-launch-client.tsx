"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useApiClient } from "@/hooks/use-api-client";
import { API_URL } from "@/lib/constants";
import { getApiErrorMessage } from "@/lib/api-errors";

type LaunchState = "idle" | "resuming" | "error";

export default function ShopifyLaunchClient({
  launch,
  hasClerk,
  isSignedIn,
}: {
  launch: string;
  hasClerk: boolean;
  isSignedIn: boolean;
}): React.ReactElement {
  const { buildHeaders } = useApiClient();
  const startedRef = useRef(false);
  const [state, setState] = useState<LaunchState>("idle");
  const [error, setError] = useState("");

  const returnPath = useMemo(() => {
    return `/shopify/launch?launch=${encodeURIComponent(launch)}`;
  }, [launch]);

  useEffect(() => {
    if (!launch || (hasClerk && !isSignedIn) || startedRef.current) {
      return;
    }

    startedRef.current = true;
    let active = true;

    async function resumeLaunch(): Promise<void> {
      setState("resuming");
      setError("");

      try {
        const res = await fetch(`${API_URL}/api/dashboard/connections/shopify/launch/resume`, {
          method: "POST",
          headers: await buildHeaders(),
          body: JSON.stringify({ launch }),
        });

        if (!res.ok) {
          const payload = await res.json().catch(() => null);
          throw new Error(
            getApiErrorMessage(payload, "Unable to continue Shopify setup right now.")
          );
        }

        const data = (await res.json()) as { url: string };
        if (active) {
          window.location.href = data.url;
        }
      } catch (resumeError) {
        if (!active) {
          return;
        }

        setState("error");
        setError(
          resumeError instanceof Error
            ? resumeError.message
            : "Unable to continue Shopify setup right now."
        );
      }
    }

    void resumeLaunch();

    return () => {
      active = false;
    };
  }, [API_URL, buildHeaders, hasClerk, isSignedIn, launch]);

  const showAuthCta = hasClerk && !isSignedIn;

  return (
    <main className="min-h-screen bg-[#f7f7fb] px-4 py-16">
      <div className="mx-auto max-w-md rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className="mb-6">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#534AB7]/10 text-2xl">
            🛍️
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Continue in Kommand</h1>
          <p className="mt-2 text-sm leading-6 text-gray-500">
            Shopify opened Kommand from your store. We&apos;ll finish connecting your store and
            take you to the right next step in Kommand.
          </p>
        </div>

        {!launch && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Missing Shopify launch token. Re-open Kommand from your Shopify Admin and try again.
          </div>
        )}

        {showAuthCta && launch && (
          <div className="space-y-3">
            <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
              Sign in or create your Kommand account first. After auth, we&apos;ll continue the
              Shopify connection automatically.
            </div>
            <Link
              href={`/sign-in?redirect_url=${encodeURIComponent(returnPath)}`}
              className="block w-full rounded-xl bg-[#534AB7] px-4 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-[#4540a0]"
            >
              Sign in to Kommand
            </Link>
            <Link
              href={`/sign-up?redirect_url=${encodeURIComponent(returnPath)}`}
              className="block w-full rounded-xl border border-gray-200 px-4 py-3 text-center text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
            >
              Create account
            </Link>
          </div>
        )}

        {!showAuthCta && launch && (
          <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
            {state === "resuming"
              ? "Resuming Shopify setup…"
              : "Preparing your Shopify connection…"}
          </div>
        )}

        {state === "error" && error && (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mt-6 text-sm text-gray-500">
          Kommand keeps the setup lightweight here. Day-to-day usage happens in WhatsApp.
        </div>
      </div>
    </main>
  );
}
