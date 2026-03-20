"use client";

import { useState, useEffect, useCallback } from "react";
import { useApiClient, API_URL } from "@/hooks/use-api-client";
import { TIMEZONES, CURRENCIES } from "@/lib/constants";

// ─── Types ────────────────────────────────────────────────────────────────────

interface NotifPrefs {
  newOrders: boolean;
  lowStock: boolean;
  dailyBrief: boolean;
}

interface Memory {
  id: string;
  content: string;
  category: string;
  createdAt: string;
}

interface UsageData {
  plan: string;
  runsThisMonth: number;
  tokensThisMonth: number;
  runsLimit: number;
  tokensLimit: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pct(used: number, limit: number): number {
  return Math.min(Math.round((used / limit) * 100), 100);
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) { return `${(n / 1_000_000).toFixed(1)}M`; }
  if (n >= 1_000) { return `${(n / 1_000).toFixed(1)}k`; }
  return String(n);
}

function categoryColor(cat: string): string {
  const map: Record<string, string> = {
    preference: "bg-purple-100 text-purple-700",
    pattern: "bg-blue-100 text-blue-700",
    contact: "bg-green-100 text-green-700",
    decision: "bg-amber-100 text-amber-700",
    observation: "bg-gray-100 text-gray-600",
    workflow: "bg-pink-100 text-pink-700",
  };
  return map[cat] ?? "bg-gray-100 text-gray-600";
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

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6">
      <div className="mb-5">
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        {description && <p className="text-sm text-gray-500 mt-0.5">{description}</p>}
      </div>
      {children}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const NOTIF_ITEMS: { key: keyof NotifPrefs; label: string; desc: string }[] = [
  { key: "dailyBrief", label: "Daily brief", desc: "Morning summary on WhatsApp" },
  { key: "newOrders", label: "New orders", desc: "Alert when orders come in" },
  { key: "lowStock", label: "Low stock alerts", desc: "When inventory drops below threshold" },
];

export default function PreferencesPage(): React.ReactElement {
  const { buildHeaders } = useApiClient();

  // Form state
  const [timezone, setTimezone] = useState("UTC");
  const [currency, setCurrency] = useState("USD");
  const [briefTime, setBriefTime] = useState("08:00");
  const [notifications, setNotifications] = useState<NotifPrefs>({
    newOrders: true,
    lowStock: true,
    dailyBrief: true,
  });
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState("");

  // Memories state
  const [memories, setMemories] = useState<Memory[]>([]);
  const [memoriesLoading, setMemoriesLoading] = useState(true);
  const [deletingMemory, setDeletingMemory] = useState<string | null>(null);

  // Usage state
  const [usage, setUsage] = useState<UsageData | null>(null);

  const loadAll = useCallback(async () => {
    try {
      const headers = await buildHeaders();

      const [meRes, memoriesRes, usageRes] = await Promise.all([
        fetch(`${API_URL}/api/dashboard/me`, { headers }),
        fetch(`${API_URL}/api/dashboard/memories`, { headers }),
        fetch(`${API_URL}/api/dashboard/usage`, { headers }),
      ]);

      if (meRes.ok) {
        const me = (await meRes.json()) as {
          timezone: string;
          currency: string;
          preferences?: {
            morning_brief_time?: string;
            notifications?: Partial<NotifPrefs>;
          };
        };
        setTimezone(me.timezone ?? "UTC");
        setCurrency(me.currency ?? "USD");
        setBriefTime(me.preferences?.morning_brief_time ?? "08:00");
        if (me.preferences?.notifications) {
          setNotifications({
            newOrders: me.preferences.notifications.newOrders !== false,
            lowStock: me.preferences.notifications.lowStock !== false,
            dailyBrief: me.preferences.notifications.dailyBrief !== false,
          });
        }
      }

      if (memoriesRes.ok) {
        setMemories((await memoriesRes.json()) as Memory[]);
      }
      setMemoriesLoading(false);

      if (usageRes.ok) {
        setUsage((await usageRes.json()) as UsageData);
      }
    } catch {
      setMemoriesLoading(false);
    }
  }, [buildHeaders]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  async function savePreferences(): Promise<void> {
    setSaving(true);
    setSaveError("");
    setSaveSuccess(false);
    try {
      const res = await fetch(`${API_URL}/api/dashboard/preferences`, {
        method: "PUT",
        headers: await buildHeaders(),
        body: JSON.stringify({ timezone, currency, briefTime, notifications }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setSaveError(data.error ?? "Failed to save. Please try again.");
        return;
      }
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch {
      setSaveError("Network error — check your connection.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteMemory(id: string): Promise<void> {
    setDeletingMemory(id);
    try {
      await fetch(`${API_URL}/api/dashboard/memories/${id}`, {
        method: "DELETE",
        headers: await buildHeaders(),
      });
      setMemories((prev) => prev.filter((m) => m.id !== id));
    } finally {
      setDeletingMemory(null);
    }
  }

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Preferences</h1>
        <p className="text-sm text-gray-500 mt-1">Configure how Kommand works for you.</p>
      </div>

      {/* ── Preferences form ── */}
      <Section title="General" description="Timezone, currency, and daily brief schedule.">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Timezone</label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#534AB7]/30 focus:border-[#534AB7] transition-colors"
            >
              {!TIMEZONES.some((t) => t.value === timezone) && (
                <option value={timezone}>{timezone} (current)</option>
              )}
              {TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>{tz.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Morning brief time</label>
            <input
              type="time"
              value={briefTime}
              onChange={(e) => setBriefTime(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#534AB7]/30 focus:border-[#534AB7] transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Display currency</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#534AB7]/30 focus:border-[#534AB7] transition-colors"
            >
              {CURRENCIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700 mb-3">Notifications</p>
            <div className="space-y-3">
              {NOTIF_ITEMS.map(({ key, label, desc }) => (
                <div key={key} className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm text-gray-800 font-medium">{label}</p>
                    <p className="text-xs text-gray-400">{desc}</p>
                  </div>
                  <Toggle
                    checked={notifications[key]}
                    onChange={(v) => setNotifications({ ...notifications, [key]: v })}
                  />
                </div>
              ))}
            </div>
          </div>

          {saveError && <p className="text-red-500 text-xs">{saveError}</p>}
          {saveSuccess && <p className="text-green-600 text-xs">Preferences saved.</p>}

          <button
            type="button"
            onClick={() => { void savePreferences(); }}
            disabled={saving}
            className="w-full bg-[#534AB7] hover:bg-[#4540a0] disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors"
          >
            {saving ? "Saving…" : "Save preferences"}
          </button>
        </div>
      </Section>

      {/* ── Usage ── */}
      {usage && (
        <Section
          title="Usage this month"
          description={`Plan: ${usage.plan.charAt(0).toUpperCase() + usage.plan.slice(1)}`}
        >
          <div className="space-y-4">
            {[
              {
                label: "Agent runs",
                used: usage.runsThisMonth,
                limit: usage.runsLimit,
                display: `${usage.runsThisMonth} / ${formatNumber(usage.runsLimit)}`,
              },
              {
                label: "Tokens",
                used: usage.tokensThisMonth,
                limit: usage.tokensLimit,
                display: `${formatNumber(usage.tokensThisMonth)} / ${formatNumber(usage.tokensLimit)}`,
              },
            ].map(({ label, used, limit, display }) => {
              const p = pct(used, limit);
              return (
                <div key={label}>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-sm text-gray-700">{label}</p>
                    <p className="text-xs text-gray-500">{display}</p>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        p >= 90 ? "bg-red-500" : p >= 70 ? "bg-amber-500" : "bg-[#534AB7]"
                      }`}
                      style={{ width: `${p}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">{p}% used</p>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* ── Memories ── */}
      <Section
        title="Agent memories"
        description="What Kommand has learned about your business. Delete any entry to remove it."
      >
        {memoriesLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-10 bg-gray-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : memories.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">
            No memories yet. Kommand builds these as you interact.
          </p>
        ) : (
          <div className="space-y-2">
            {memories.map((m) => (
              <div
                key={m.id}
                className="flex items-start gap-3 bg-gray-50 rounded-xl px-3 py-2.5"
              >
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 mt-0.5 ${categoryColor(m.category)}`}
                >
                  {m.category}
                </span>
                <p className="text-sm text-gray-700 flex-1 leading-snug">{m.content}</p>
                <button
                  type="button"
                  onClick={() => { void deleteMemory(m.id); }}
                  disabled={deletingMemory === m.id}
                  className="text-xs text-red-400 hover:text-red-600 disabled:opacity-40 shrink-0 mt-0.5 transition-colors"
                  aria-label="Delete memory"
                >
                  {deletingMemory === m.id ? "…" : "✕"}
                </button>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
