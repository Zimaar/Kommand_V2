"use client";

import { useEffect, useState } from "react";

interface TenantData {
  name: string;
  email: string;
  phone: string;
  timezone: string;
  plan: string;
  stores: Array<{ id: string; domain: string; name: string; platform: string }>;
  connections: Array<{ id: string; platform: string; orgName: string }>;
}

export default function SettingsPage() {
  const [data, setData] = useState<TenantData | null>(null);

  useEffect(() => {
    fetch("/api/dashboard/me")
      .then((r) => r.json())
      .then(setData)
      .catch(console.error);
  }, []);

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      <h1 className="text-2xl font-bold mb-8">Settings</h1>

      {/* Account */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
          Account
        </h2>
        <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
          <div className="px-4 py-3 flex justify-between">
            <span className="text-sm text-gray-600">Name</span>
            <span className="text-sm font-medium">{data.name}</span>
          </div>
          <div className="px-4 py-3 flex justify-between">
            <span className="text-sm text-gray-600">Email</span>
            <span className="text-sm font-medium">{data.email}</span>
          </div>
          <div className="px-4 py-3 flex justify-between">
            <span className="text-sm text-gray-600">Plan</span>
            <span className="text-sm font-medium capitalize">{data.plan}</span>
          </div>
          <div className="px-4 py-3 flex justify-between">
            <span className="text-sm text-gray-600">WhatsApp</span>
            <span className="text-sm font-medium">{data.phone ?? "Not linked"}</span>
          </div>
        </div>
      </section>

      {/* Connected stores */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
          Stores
        </h2>
        <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
          {data.stores.length === 0 ? (
            <div className="px-4 py-3 text-sm text-gray-400">No stores connected</div>
          ) : (
            data.stores.map((store) => (
              <div key={store.id} className="px-4 py-3 flex justify-between items-center">
                <div>
                  <div className="text-sm font-medium">{store.name ?? store.domain}</div>
                  <div className="text-xs text-gray-400">{store.domain}</div>
                </div>
                <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full">
                  Connected
                </span>
              </div>
            ))
          )}
        </div>
        <a
          href="/onboarding"
          className="mt-2 inline-block text-sm text-blue-600 hover:underline"
        >
          + Add store
        </a>
      </section>

      {/* Accounting */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
          Accounting
        </h2>
        <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
          {data.connections.length === 0 ? (
            <div className="px-4 py-3 text-sm text-gray-400">No accounting connected</div>
          ) : (
            data.connections.map((conn) => (
              <div key={conn.id} className="px-4 py-3 flex justify-between items-center">
                <div>
                  <div className="text-sm font-medium capitalize">{conn.platform}</div>
                  <div className="text-xs text-gray-400">{conn.orgName}</div>
                </div>
                <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full">
                  Connected
                </span>
              </div>
            ))
          )}
        </div>
        <a
          href="/webhooks/xero/connect"
          className="mt-2 inline-block text-sm text-blue-600 hover:underline"
        >
          + Connect Xero
        </a>
      </section>
    </div>
  );
}
