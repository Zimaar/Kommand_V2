"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";

type Step = "connect-shopify" | "link-whatsapp" | "done";

export default function OnboardingPage() {
  const searchParams = useSearchParams();
  const connected = searchParams.get("connected");
  const [step, setStep] = useState<Step>(
    connected === "shopify" ? "link-whatsapp" : "connect-shopify"
  );
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  async function linkWhatsApp() {
    if (!phone.startsWith("+")) {
      alert("Enter phone in E.164 format, e.g. +971501234567");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/dashboard/whatsapp/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      if (res.ok) { setStep("done"); }
    } finally {
      setSaving(false);
    }
  }

  if (step === "done") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-2xl p-10 shadow-sm max-w-md w-full text-center">
          <div className="text-5xl mb-4">✅</div>
          <h1 className="text-2xl font-bold mb-2">You&apos;re all set!</h1>
          <p className="text-gray-500 mb-6">
            Send a WhatsApp message to your Kommand number to get started.
          </p>
          <a
            href="/settings"
            className="inline-block bg-gray-900 text-white px-6 py-3 rounded-xl text-sm font-medium"
          >
            Go to settings
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-2xl p-10 shadow-sm max-w-md w-full">
        {step === "connect-shopify" && (
          <>
            <h1 className="text-2xl font-bold mb-2">Connect your store</h1>
            <p className="text-gray-500 mb-6">
              Enter your Shopify store domain to get started.
            </p>
            <form
              action={`${process.env.NEXT_PUBLIC_API_URL}/webhooks/shopify/install`}
              method="GET"
            >
              <input
                type="hidden"
                name="tenant_id"
                value="" // filled by middleware in production
              />
              <input
                type="text"
                name="shop"
                placeholder="yourstore.myshopify.com"
                className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
              <button
                type="submit"
                className="w-full bg-gray-900 text-white py-3 rounded-xl text-sm font-medium hover:bg-gray-700 transition-colors"
              >
                Connect Shopify
              </button>
            </form>
          </>
        )}

        {step === "link-whatsapp" && (
          <>
            <h1 className="text-2xl font-bold mb-2">Link WhatsApp</h1>
            <p className="text-gray-500 mb-6">
              Enter the WhatsApp number you&apos;ll use to chat with Kommand.
            </p>
            <input
              type="tel"
              placeholder="+971501234567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            <button
              onClick={linkWhatsApp}
              disabled={saving}
              className="w-full bg-gray-900 text-white py-3 rounded-xl text-sm font-medium hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              {saving ? "Linking..." : "Link WhatsApp"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
