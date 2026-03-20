"use client";

import { useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useApiClient } from "@/hooks/use-api-client";
import { API_URL, COUNTRY_CODES, TIMEZONES, CURRENCIES } from "@/lib/constants";

// ─── Types ────────────────────────────────────────────────────────────────────

type ActiveStep = 1 | 2 | 3;

interface NotifPrefs {
  newOrders: boolean;
  lowStock: boolean;
  dailyBrief: boolean;
}

// ─── Progress indicator ───────────────────────────────────────────────────────

const STEPS = [
  { id: 1 as const, label: "Connect Shopify" },
  { id: 2 as const, label: "Link WhatsApp" },
  { id: 3 as const, label: "Preferences" },
];

function ProgressIndicator({
  activeStep,
  shopDomain,
}: {
  activeStep: ActiveStep;
  shopDomain: string;
}): React.ReactElement {
  return (
    <div className="flex items-start justify-between relative px-1">
      <div className="absolute top-4 left-8 right-8 h-px bg-gray-200" />

      {STEPS.map((step) => {
        // Step 1 is only "done" if shopify was actually connected (not skipped)
        const isDone =
          step.id === 1 ? activeStep > 1 && !!shopDomain : step.id < activeStep;
        const isActive = step.id === activeStep;
        const isFuture = !isDone && !isActive;

        return (
          <div key={step.id} className="relative z-10 flex flex-col items-center gap-2 flex-1">
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
            <p
              className={`text-xs font-medium text-center leading-tight ${
                isDone
                  ? "text-green-600"
                  : isActive
                  ? "text-[#534AB7]"
                  : isFuture
                  ? "text-gray-400"
                  : "text-gray-600"
              }`}
            >
              {step.label}
            </p>
            {step.id === 1 && isDone && shopDomain && (
              <p className="text-[10px] text-green-600 text-center truncate max-w-[80px]">
                {shopDomain}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Toggle ───────────────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-10 shrink-0 items-center rounded-full transition-colors ${
        checked ? "bg-[#534AB7]" : "bg-gray-200"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-5" : "translate-x-1"
        }`}
      />
    </button>
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
  countryCode,
  setCountryCode,
  phoneNumber,
  setPhoneNumber,
  phoneError,
  linking,
  linked,
  shopifyDone,
  onLink,
  onContinue,
  onSkip,
}: {
  countryCode: string;
  setCountryCode: (v: string) => void;
  phoneNumber: string;
  setPhoneNumber: (v: string) => void;
  phoneError: string;
  linking: boolean;
  linked: boolean;
  shopifyDone: boolean;
  onLink: () => void;
  onContinue: () => void;
  onSkip: () => void;
}): React.ReactElement {
  // After successful link: show confirmation message
  if (linked) {
    return (
      <div className="text-center py-2">
        <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
          <span className="text-2xl">✅</span>
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">WhatsApp linked!</h2>
        <p className="text-sm text-gray-500 mb-2">
          We sent you a welcome message on WhatsApp. Check your messages to confirm it arrived.
        </p>
        <p className="text-xs text-gray-400 mb-8">
          Not there yet? It can take up to 60 seconds.
        </p>
        <button
          type="button"
          onClick={onContinue}
          className="w-full bg-[#534AB7] hover:bg-[#4540a0] text-white py-3 rounded-xl text-sm font-semibold transition-colors"
        >
          Continue to preferences →
        </button>
      </div>
    );
  }

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
          <div className="flex gap-2">
            <select
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value)}
              disabled={linking}
              className="border border-gray-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#534AB7]/30 focus:border-[#534AB7] bg-white disabled:opacity-50 transition-colors shrink-0"
            >
              {COUNTRY_CODES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { onLink(); } }}
              placeholder="50 123 4567"
              disabled={linking}
              className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#534AB7]/30 focus:border-[#534AB7] disabled:opacity-50 transition-colors"
            />
          </div>
          {phoneError && <p className="text-red-500 text-xs mt-1.5">{phoneError}</p>}
          <p className="text-xs text-gray-400 mt-1.5">Local number without country code</p>
        </div>
        <button
          type="button"
          onClick={onLink}
          disabled={linking || !phoneNumber.trim()}
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

// ─── Step 3 — Preferences ────────────────────────────────────────────────────

function StepPreferences({
  timezone,
  setTimezone,
  currency,
  setCurrency,
  briefTime,
  setBriefTime,
  notifications,
  setNotifications,
  saving,
  saveError,
  onSave,
}: {
  timezone: string;
  setTimezone: (v: string) => void;
  currency: string;
  setCurrency: (v: string) => void;
  briefTime: string;
  setBriefTime: (v: string) => void;
  notifications: NotifPrefs;
  setNotifications: (v: NotifPrefs) => void;
  saving: boolean;
  saveError: string;
  onSave: () => void;
}): React.ReactElement {
  function toggleNotif(key: keyof NotifPrefs): void {
    setNotifications({ ...notifications, [key]: !notifications[key] });
  }

  return (
    <>
      <div className="mb-6">
        <div className="w-12 h-12 rounded-2xl bg-purple-50 flex items-center justify-center mb-4">
          <span className="text-2xl">⚙️</span>
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-1">Set your preferences</h2>
        <p className="text-sm text-gray-500">Kommand uses these to tailor your daily brief and alerts.</p>
      </div>

      <div className="space-y-5">
        {/* Timezone */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Timezone</label>
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#534AB7]/30 focus:border-[#534AB7] transition-colors"
          >
            {/* Show detected timezone if not in list */}
            {!TIMEZONES.some((t) => t.value === timezone) && (
              <option value={timezone}>{timezone} (detected)</option>
            )}
            {TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>
                {tz.label}
              </option>
            ))}
          </select>
        </div>

        {/* Morning brief time */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Morning brief time</label>
          <input
            type="time"
            value={briefTime}
            onChange={(e) => setBriefTime(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#534AB7]/30 focus:border-[#534AB7] transition-colors"
          />
          <p className="text-xs text-gray-400 mt-1.5">Kommand will send your store summary at this time each day.</p>
        </div>

        {/* Currency */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Display currency</label>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#534AB7]/30 focus:border-[#534AB7] transition-colors"
          >
            {CURRENCIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        {/* Notifications */}
        <div>
          <p className="text-sm font-medium text-gray-700 mb-3">Notifications</p>
          <div className="space-y-3">
            {(
              [
                { key: "dailyBrief", label: "Daily brief", desc: "Morning summary sent to WhatsApp" },
                { key: "newOrders", label: "New orders", desc: "Alert when orders come in" },
                { key: "lowStock", label: "Low stock alerts", desc: "When inventory drops below threshold" },
              ] as { key: keyof NotifPrefs; label: string; desc: string }[]
            ).map(({ key, label, desc }) => (
              <div key={key} className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm text-gray-800 font-medium">{label}</p>
                  <p className="text-xs text-gray-400">{desc}</p>
                </div>
                <Toggle
                  checked={notifications[key]}
                  onChange={() => toggleNotif(key)}
                />
              </div>
            ))}
          </div>
        </div>

        {saveError && <p className="text-red-500 text-xs">{saveError}</p>}

        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="w-full bg-[#534AB7] hover:bg-[#4540a0] disabled:opacity-50 text-white py-3 rounded-xl text-sm font-semibold transition-colors"
        >
          {saving ? "Saving…" : "Complete Setup"}
        </button>
      </div>
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

function OnboardingPageInner(): React.ReactElement {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { buildHeaders } = useApiClient();

  const connectedParam = searchParams.get("connected");
  const shopParam = searchParams.get("shop") ?? "";
  const stepParam = searchParams.get("step");
  const errorParam = searchParams.get("error");

  const initialStep: ActiveStep =
    stepParam === "2" || connectedParam === "shopify" ? 2 : 1;

  const [activeStep, setActiveStep] = useState<ActiveStep>(initialStep);
  const [shopDomain, setShopDomain] = useState(shopParam);

  // Step 1
  const [shopInput, setShopInput] = useState("");
  const [shopError, setShopError] = useState(
    errorParam === "shopify_oauth_failed" ? "Shopify connection failed — please try again." : ""
  );
  const [connecting, setConnecting] = useState(false);

  // Step 2
  const [countryCode, setCountryCode] = useState("+971");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [linking, setLinking] = useState(false);
  const [whatsappLinked, setWhatsappLinked] = useState(false);

  // Step 3
  const [timezone, setTimezone] = useState(detectTimezone);
  const [currency, setCurrency] = useState("USD");
  const [briefTime, setBriefTime] = useState("08:00");
  const [notifications, setNotifications] = useState<NotifPrefs>({
    newOrders: true,
    lowStock: true,
    dailyBrief: true,
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  async function initiateShopify(): Promise<void> {
    let shop = shopInput.trim().toLowerCase();
    if (!shop.includes(".")) { shop = `${shop}.myshopify.com`; }

    if (!/^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(shop)) {
      setShopError("Use format: yourstore.myshopify.com");
      return;
    }

    setShopError("");
    setConnecting(true);

    try {
      const res = await fetch(`${API_URL}/api/dashboard/connections/shopify/initiate`, {
        method: "POST",
        headers: await buildHeaders(),
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
    const digits = phoneNumber.replace(/\D/g, "");
    if (digits.length < 6) {
      setPhoneError("Enter a valid local phone number");
      return;
    }

    const full = `${countryCode}${digits}`;
    setPhoneError("");
    setLinking(true);

    try {
      const res = await fetch(`${API_URL}/api/dashboard/whatsapp/link`, {
        method: "POST",
        headers: await buildHeaders(),
        body: JSON.stringify({ phone: full }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setPhoneError(data.error ?? "Failed to link. Please try again.");
        return;
      }

      setWhatsappLinked(true);
    } catch {
      setPhoneError("Network error — check your connection and try again.");
    } finally {
      setLinking(false);
    }
  }

  async function savePreferences(): Promise<void> {
    setSaveError("");
    setSaving(true);

    try {
      const res = await fetch(`${API_URL}/api/dashboard/preferences`, {
        method: "PUT",
        headers: await buildHeaders(),
        body: JSON.stringify({ timezone, currency, briefTime, notifications }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setSaveError(data.error ?? "Failed to save preferences. Please try again.");
        return;
      }

      router.push("/overview?welcome=1");
    } catch {
      setSaveError("Network error — check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  const shopifyDone = connectedParam === "shopify" || (activeStep > 1 && !!shopDomain);

  return (
    <div className="flex items-start justify-center min-h-full py-12 px-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Set up Kommand</h1>
          <p className="text-sm text-gray-500 mt-1">3 quick steps to get started.</p>
        </div>

        {/* Progress */}
        <ProgressIndicator activeStep={activeStep} shopDomain={shopDomain} />

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
                setShopDomain("");
                setActiveStep(2);
              }}
            />
          )}

          {activeStep === 2 && (
            <StepWhatsApp
              countryCode={countryCode}
              setCountryCode={setCountryCode}
              phoneNumber={phoneNumber}
              setPhoneNumber={setPhoneNumber}
              phoneError={phoneError}
              linking={linking}
              linked={whatsappLinked}
              shopifyDone={shopifyDone}
              onLink={() => { void linkWhatsApp(); }}
              onContinue={() => { setActiveStep(3); }}
              onSkip={() => { setActiveStep(3); }}
            />
          )}

          {activeStep === 3 && (
            <StepPreferences
              timezone={timezone}
              setTimezone={setTimezone}
              currency={currency}
              setCurrency={setCurrency}
              briefTime={briefTime}
              setBriefTime={setBriefTime}
              notifications={notifications}
              setNotifications={setNotifications}
              saving={saving}
              saveError={saveError}
              onSave={() => { void savePreferences(); }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default function OnboardingPage(): React.ReactElement {
  return (
    <Suspense>
      <OnboardingPageInner />
    </Suspense>
  );
}
