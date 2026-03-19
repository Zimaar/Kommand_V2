"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

// ─── Types ────────────────────────────────────────────────────────────────────

type ActiveStep = 1 | 2 | 3;

// ─── Progress indicator ───────────────────────────────────────────────────────

const STEPS = [
  { id: 1 as const, label: "Connect Shopify" },
  { id: 2 as const, label: "Link WhatsApp" },
  { id: 3 as const, label: "Done" },
];

function ProgressIndicator({
  activeStep,
  shopifyDone,
  shopDomain,
}: {
  activeStep: ActiveStep;
  shopifyDone: boolean;
  shopDomain: string;
}): React.ReactElement {
  return (
    <div className="flex items-start justify-between relative px-1">
      {/* Connecting line */}
      <div className="absolute top-4 left-8 right-8 h-px bg-gray-200" />

      {STEPS.map((step) => {
        const isDone = (step.id === 1 && shopifyDone) || (step.id === 2 && activeStep > 2);
        const isActive = step.id === activeStep && !isDone;
        const isFuture = step.id > activeStep;

        return (
          <div key={step.id} className="relative z-10 flex flex-col items-center gap-2 flex-1">
            {/* Dot */}
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-colors ${
                isDone
                  ? "bg-green-500 border-green-500 text-white"
                  : isActive
                  ? "bg-[#534AB7] border-[#534AB7] text-white"
                  : "bg-white border-gray-200 text-gray-400"
              }`}
            >
              {isDone ? "✓" : step.id}
            </div>

            {/* Label */}
            <p
              className={`text-xs font-medium text-center leading-tight ${
                isDone ? "text-green-600" : isActive ? "text-[#534AB7]" : isFuture ? "text-gray-400" : "text-gray-600"
              }`}
            >
              {step.label}
            </p>

            {/* Step 1 completion detail */}
            {step.id === 1 && isDone && shopDomain && (
              <p className="text-[10px] text-green-600 text-center truncate max-w-[80px]">{shopDomain}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Step 1 — Connect Shopify ─────────────────────────────────────────────────

function StepShopify({
  shopInput,
  setShopInput,
  shopError,
  connecting,
  onConnect,
  onSkip,
}: {
  shopInput: string;
  setShopInput: (v: string) => void;
  shopError: string;
  connecting: boolean;
  onConnect: () => void;
  onSkip: () => void;
}): React.ReactElement {
  return (
    <>
      <div className="mb-6">
        <div className="w-12 h-12 rounded-2xl bg-green-50 flex items-center justify-center mb-4">
          <span className="text-2xl">🏪</span>
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-1">Connect your Shopify store</h2>
        <p className="text-sm text-gray-500">
          Kommand needs read access to your orders, products, and customers.
        </p>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Store URL</label>
          <input
            type="text"
            value={shopInput}
            onChange={(e) => setShopInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { onConnect(); } }}
            placeholder="yourstore.myshopify.com"
            disabled={connecting}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#534AB7]/30 focus:border-[#534AB7] disabled:opacity-50 transition-colors"
          />
          {shopError && <p className="text-red-500 text-xs mt-1.5">{shopError}</p>}
        </div>

        <button
          type="button"
          onClick={onConnect}
          disabled={connecting || !shopInput.trim()}
          className="w-full bg-[#534AB7] hover:bg-[#4540a0] disabled:opacity-50 text-white py-3 rounded-xl text-sm font-semibold transition-colors"
        >
          {connecting ? "Redirecting to Shopify…" : "Connect Shopify"}
        </button>
      </div>

      <div className="mt-4 text-center">
        <button
          type="button"
          onClick={onSkip}
          className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >
          Skip for now →
        </button>
      </div>
    </>
  );
}

// ─── Step 2 — Link WhatsApp ───────────────────────────────────────────────────

function StepWhatsApp({
  phone,
  setPhone,
  phoneError,
  linking,
  shopifyDone,
  onLink,
  onSkip,
}: {
  phone: string;
  setPhone: (v: string) => void;
  phoneError: string;
  linking: boolean;
  shopifyDone: boolean;
  onLink: () => void;
  onSkip: () => void;
}): React.ReactElement {
  return (
    <>
      {shopifyDone && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2.5 mb-5 text-sm text-green-700">
          <span className="text-green-500 font-bold">✓</span>
          Shopify store connected successfully
        </div>
      )}

      <div className="mb-6">
        <div className="w-12 h-12 rounded-2xl bg-[#534AB7]/10 flex items-center justify-center mb-4">
          <span className="text-2xl">💬</span>
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-1">Link your WhatsApp</h2>
        <p className="text-sm text-gray-500">
          Enter the number you&apos;ll use to chat with Kommand. We&apos;ll send a welcome message to confirm.
        </p>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">WhatsApp number</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { onLink(); } }}
            placeholder="+971 50 123 4567"
            disabled={linking}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#534AB7]/30 focus:border-[#534AB7] disabled:opacity-50 transition-colors"
          />
          {phoneError && <p className="text-red-500 text-xs mt-1.5">{phoneError}</p>}
          <p className="text-xs text-gray-400 mt-1.5">Include country code, e.g. +971501234567</p>
        </div>

        <button
          type="button"
          onClick={onLink}
          disabled={linking || !phone.trim()}
          className="w-full bg-[#534AB7] hover:bg-[#4540a0] disabled:opacity-50 text-white py-3 rounded-xl text-sm font-semibold transition-colors"
        >
          {linking ? "Linking…" : "Link WhatsApp"}
        </button>
      </div>

      <div className="mt-4 text-center">
        <button
          type="button"
          onClick={onSkip}
          className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >
          Skip for now →
        </button>
      </div>
    </>
  );
}

// ─── Step 3 — Done ────────────────────────────────────────────────────────────

function StepDone(): React.ReactElement {
  return (
    <div className="text-center py-4">
      <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-5">
        <span className="text-3xl">✅</span>
      </div>
      <h2 className="text-xl font-bold text-gray-900 mb-2">You&apos;re all set!</h2>
      <p className="text-sm text-gray-500 mb-8 max-w-xs mx-auto">
        Send a WhatsApp message to your Kommand number to get started. Try: &ldquo;How&apos;s my store doing?&rdquo;
      </p>
      <Link
        href="/overview"
        className="inline-block bg-[#534AB7] hover:bg-[#4540a0] text-white px-8 py-3 rounded-xl text-sm font-semibold transition-colors"
      >
        Go to dashboard
      </Link>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OnboardingPage(): React.ReactElement {
  const searchParams = useSearchParams();
  const { userId, getToken } = useAuth();

  const connectedParam = searchParams.get("connected");
  const shopParam = searchParams.get("shop") ?? "";
  const stepParam = searchParams.get("step");
  const errorParam = searchParams.get("error");

  const initialStep: ActiveStep =
    stepParam === "2" || connectedParam === "shopify" ? 2 : 1;

  const [activeStep, setActiveStep] = useState<ActiveStep>(initialStep);
  const [shopifyDone, setShopifyDone] = useState(connectedParam === "shopify");
  const [shopDomain, setShopDomain] = useState(shopParam);

  // Step 1
  const [shopInput, setShopInput] = useState("");
  const [shopError, setShopError] = useState(
    errorParam === "shopify_oauth_failed" ? "Shopify connection failed — please try again." : ""
  );
  const [connecting, setConnecting] = useState(false);

  // Step 2
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [linking, setLinking] = useState(false);

  async function initiateShopify(): Promise<void> {
    let shop = shopInput.trim().toLowerCase();

    // Auto-complete: if no dot, assume it's just the subdomain
    if (!shop.includes(".")) {
      shop = `${shop}.myshopify.com`;
    }

    if (!/^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(shop)) {
      setShopError("Use format: yourstore.myshopify.com");
      return;
    }

    setShopError("");
    setConnecting(true);

    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/api/dashboard/connections/shopify/initiate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(userId ? { "x-tenant-id": userId } : {}),
        },
        body: JSON.stringify({ shop }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setShopError(data.error ?? "Something went wrong. Please try again.");
        return;
      }

      const { url } = (await res.json()) as { url: string };
      window.location.href = url;
    } catch {
      setShopError("Network error — check your connection and try again.");
    } finally {
      setConnecting(false);
    }
  }

  async function linkWhatsApp(): Promise<void> {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 8) {
      setPhoneError("Enter a valid phone number with country code");
      return;
    }

    setPhoneError("");
    setLinking(true);

    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/api/dashboard/whatsapp/link`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(userId ? { "x-tenant-id": userId } : {}),
        },
        body: JSON.stringify({ phone: `+${digits}` }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setPhoneError(data.error ?? "Failed to link. Please try again.");
        return;
      }

      setActiveStep(3);
    } catch {
      setPhoneError("Network error — check your connection and try again.");
    } finally {
      setLinking(false);
    }
  }

  return (
    <div className="flex items-start justify-center min-h-full py-12 px-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Set up Kommand</h1>
          <p className="text-sm text-gray-500 mt-1">2 quick steps to connect your store.</p>
        </div>

        {/* Progress */}
        <ProgressIndicator
          activeStep={activeStep}
          shopifyDone={shopifyDone}
          shopDomain={shopDomain}
        />

        {/* Step card */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 mt-8">
          {activeStep === 1 && (
            <StepShopify
              shopInput={shopInput}
              setShopInput={setShopInput}
              shopError={shopError}
              connecting={connecting}
              onConnect={() => { void initiateShopify(); }}
              onSkip={() => {
                setShopifyDone(false);
                setShopDomain("");
                setActiveStep(2);
              }}
            />
          )}

          {activeStep === 2 && (
            <StepWhatsApp
              phone={phone}
              setPhone={setPhone}
              phoneError={phoneError}
              linking={linking}
              shopifyDone={shopifyDone}
              onLink={() => { void linkWhatsApp(); }}
              onSkip={() => { setActiveStep(3); }}
            />
          )}

          {activeStep === 3 && <StepDone />}
        </div>
      </div>
    </div>
  );
}
