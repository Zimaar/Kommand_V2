"use client";

import { useState, useEffect, useCallback } from "react";
import { useApiClient } from "@/hooks/use-api-client";
import { API_URL } from "@/lib/constants";

// ─── Types ────────────────────────────────────────────────────────────────────

interface StoreRow {
  id: string;
  platform: string;
  domain: string;
  name: string | null;
  isActive: boolean;
  createdAt: string;
}

interface AccountingRow {
  id: string;
  platform: string;
  orgName: string | null;
  isActive: boolean;
  createdAt: string;
}

interface ChannelRow {
  id: string;
  type: string;
  identifier: string;
  isActive: boolean;
  createdAt: string;
}

interface ConnectionsData {
  stores: StoreRow[];
  connections: AccountingRow[];
  channels: ChannelRow[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function relativeDate(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 86400000);
  if (days === 0) { return "today"; }
  if (days === 1) { return "yesterday"; }
  if (days < 30) { return `${days}d ago`; }
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function platformLabel(platform: string): string {
  const map: Record<string, string> = {
    shopify: "Shopify",
    woocommerce: "WooCommerce",
    xero: "Xero",
    quickbooks: "QuickBooks",
    whatsapp: "WhatsApp",
    slack: "Slack",
    email: "Email",
  };
  return map[platform] ?? platform;
}

function platformIcon(platform: string): string {
  const map: Record<string, string> = {
    shopify: "🏪",
    woocommerce: "🛍️",
    xero: "📊",
    quickbooks: "📘",
    whatsapp: "💬",
    slack: "💼",
    email: "✉️",
  };
  return map[platform] ?? "🔌";
}

// ─── Connection Card ──────────────────────────────────────────────────────────

function ConnectionCard({
  icon,
  name,
  subtitle,
  isActive,
  connectedAt,
  onDisconnect,
  disconnecting,
}: {
  icon: string;
  name: string;
  subtitle: string;
  isActive: boolean;
  connectedAt: string;
  onDisconnect: () => void;
  disconnecting: boolean;
}): React.ReactElement {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 flex items-start gap-4">
      <div className="w-11 h-11 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center text-xl shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="font-semibold text-gray-900 text-sm">{name}</p>
          {isActive ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
              Active
            </span>
          ) : (
            <span className="text-xs font-medium text-gray-400 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full">
              Inactive
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 truncate">{subtitle}</p>
        <p className="text-xs text-gray-400 mt-0.5">Connected {connectedAt}</p>
      </div>
      <button
        type="button"
        onClick={onDisconnect}
        disabled={disconnecting}
        className="text-xs text-red-500 hover:text-red-700 disabled:opacity-40 shrink-0 mt-0.5 transition-colors"
      >
        {disconnecting ? "…" : "Disconnect"}
      </button>
    </div>
  );
}

// ─── Connect Xero Button ──────────────────────────────────────────────────────

function ConnectXeroButton({
  buildHeaders,
}: {
  buildHeaders: () => Promise<Record<string, string>>;
}): React.ReactElement {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleConnect(): Promise<void> {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/api/dashboard/connections/xero/initiate`, {
        method: "POST",
        headers: await buildHeaders(),
      });
      if (!res.ok) {
        setError("Could not start Xero connection. Try again.");
        return;
      }
      const { url } = (await res.json()) as { url: string };
      window.location.href = url;
    } catch {
      setError("Could not start Xero connection. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => { void handleConnect(); }}
        disabled={loading}
        className="text-xs text-[#534AB7] font-medium hover:underline disabled:opacity-40 shrink-0 mt-0.5 transition-opacity"
      >
        {loading ? "…" : "Connect →"}
      </button>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

// ─── Available Platform Card ──────────────────────────────────────────────────

function AvailableCard({
  icon,
  name,
  description,
  href,
  comingSoon,
}: {
  icon: string;
  name: string;
  description: string;
  href?: string;
  comingSoon?: boolean;
}): React.ReactElement {
  return (
    <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-5 flex items-start gap-4">
      <div className="w-11 h-11 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center text-xl shrink-0 opacity-60">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-700 text-sm mb-0.5">{name}</p>
        <p className="text-xs text-gray-400">{description}</p>
      </div>
      {comingSoon ? (
        <span className="text-xs text-gray-400 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full shrink-0 mt-0.5">
          Soon
        </span>
      ) : href ? (
        <a
          href={href}
          className="text-xs text-[#534AB7] font-medium hover:underline shrink-0 mt-0.5"
        >
          Connect →
        </a>
      ) : null}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ConnectionsPage(): React.ReactElement {
  const { buildHeaders } = useApiClient();
  const [data, setData] = useState<ConnectionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [banner, setBanner] = useState<{ message: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected") === "xero") { setBanner({ message: "Xero connected successfully.", type: "success" }); }
    if (params.get("error") === "xero_oauth_failed") { setBanner({ message: "Xero connection failed. Please try again.", type: "error" }); }
    if (params.get("error") === "xero_denied") { setBanner({ message: "Xero connection cancelled.", type: "error" }); }
    // Strip query params without full reload
    if (params.toString()) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/api/dashboard/connections`, {
        headers: await buildHeaders(),
      });
      if (!res.ok) { throw new Error("Failed to load connections"); }
      setData((await res.json()) as ConnectionsData);
    } catch {
      setError("Could not load connections. Check your API is running.");
    } finally {
      setLoading(false);
    }
  }, [buildHeaders]);

  useEffect(() => { void load(); }, [load]);

  async function disconnectStore(id: string): Promise<void> {
    setDisconnecting(id);
    try {
      const res = await fetch(`${API_URL}/api/dashboard/stores/${id}`, {
        method: "DELETE",
        headers: await buildHeaders(),
      });
      if (!res.ok) { setError("Failed to disconnect store. Please try again."); return; }
      await load();
    } finally {
      setDisconnecting(null);
    }
  }

  async function disconnectAccounting(id: string): Promise<void> {
    setDisconnecting(id);
    try {
      const res = await fetch(`${API_URL}/api/dashboard/connections/${id}`, {
        method: "DELETE",
        headers: await buildHeaders(),
      });
      if (!res.ok) { setError("Failed to disconnect accounting. Please try again."); return; }
      await load();
    } finally {
      setDisconnecting(null);
    }
  }

  async function disconnectWhatsApp(): Promise<void> {
    setDisconnecting("whatsapp");
    try {
      const res = await fetch(`${API_URL}/api/dashboard/whatsapp`, {
        method: "DELETE",
        headers: await buildHeaders(),
      });
      if (!res.ok) { setError("Failed to disconnect WhatsApp. Please try again."); return; }
      await load();
    } finally {
      setDisconnecting(null);
    }
  }

  // Backend now returns only active connections, so no client-side filtering needed.
  const stores = data?.stores ?? [];
  const connections = data?.connections ?? [];
  const channels = data?.channels ?? [];

  const hasShopify = stores.some((s) => s.platform === "shopify");
  const hasWhatsApp = channels.some((c) => c.type === "whatsapp");
  const hasAccounting = connections.length > 0;

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Connections</h1>
        <p className="text-sm text-gray-500 mt-1">Manage your store and channel integrations.</p>
      </div>

      {/* Banner */}
      {banner && (
        <div className={`${banner.type === "success" ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"} border text-sm rounded-xl p-4 flex items-center justify-between`}>
          {banner.message}
          <button type="button" onClick={() => setBanner(null)} className={`${banner.type === "success" ? "text-green-500 hover:text-green-700" : "text-red-500 hover:text-red-700"} ml-3`}>✕</button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          {[1, 2].map((n) => (
            <div key={n} className="bg-white rounded-2xl border border-gray-200 p-5 h-20 animate-pulse" />
          ))}
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-4">
          {error}
          <button type="button" onClick={() => { void load(); }} className="ml-3 underline text-red-600">
            Retry
          </button>
        </div>
      )}

      {/* Connected integrations */}
      {!loading && !error && data && (
        <>
          {stores.length === 0 && channels.length === 0 && connections.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">
              No connections yet.{" "}
              <a href="/onboarding" className="text-[#534AB7] hover:underline">
                Set up Kommand →
              </a>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Connected</p>

              {stores.map((s) => (
                <ConnectionCard
                  key={s.id}
                  icon={platformIcon(s.platform)}
                  name={platformLabel(s.platform)}
                  subtitle={s.name ? `${s.name} — ${s.domain}` : s.domain}
                  isActive={s.isActive}
                  connectedAt={relativeDate(s.createdAt)}
                  onDisconnect={() => { void disconnectStore(s.id); }}
                  disconnecting={disconnecting === s.id}
                />
              ))}

              {channels.map((c) => (
                <ConnectionCard
                  key={c.id}
                  icon={platformIcon(c.type)}
                  name={platformLabel(c.type)}
                  subtitle={c.identifier}
                  isActive={c.isActive}
                  connectedAt={relativeDate(c.createdAt)}
                  onDisconnect={() => { void disconnectWhatsApp(); }}
                  disconnecting={disconnecting === "whatsapp"}
                />
              ))}

              {connections.map((c) => (
                <ConnectionCard
                  key={c.id}
                  icon={platformIcon(c.platform)}
                  name={platformLabel(c.platform)}
                  subtitle={c.orgName ?? c.platform}
                  isActive={c.isActive}
                  connectedAt={relativeDate(c.createdAt)}
                  onDisconnect={() => { void disconnectAccounting(c.id); }}
                  disconnecting={disconnecting === c.id}
                />
              ))}
            </div>
          )}

          {/* Available platforms */}
          {(!hasShopify || !hasWhatsApp || !hasAccounting) && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Add integration</p>

              {!hasShopify && (
                <AvailableCard
                  icon="🏪"
                  name="Shopify"
                  description="Connect your store for orders, products, and analytics."
                  href="/onboarding"
                />
              )}

              {!hasWhatsApp && (
                <AvailableCard
                  icon="💬"
                  name="WhatsApp"
                  description="Link your number to chat with Kommand."
                  href="/onboarding?step=2"
                />
              )}

              {!hasAccounting && (
                <>
                  <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-5 flex items-start gap-4">
                    <div className="w-11 h-11 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center text-xl shrink-0 opacity-60">
                      📊
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-700 text-sm mb-0.5">Xero</p>
                      <p className="text-xs text-gray-400">Invoices, bills, and financial reports.</p>
                    </div>
                    <ConnectXeroButton buildHeaders={buildHeaders} />
                  </div>
                  <AvailableCard
                    icon="📘"
                    name="QuickBooks"
                    description="Accounting and expense tracking."
                    comingSoon
                  />
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
