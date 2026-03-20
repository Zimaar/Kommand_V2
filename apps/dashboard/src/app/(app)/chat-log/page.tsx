"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useApiClient } from "@/hooks/use-api-client";
import { API_URL } from "@/lib/constants";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PrimitiveCall {
  name: string;
  input?: unknown;
  output?: unknown;
}

interface Message {
  id: string;
  direction: string;
  role: string;
  content: string;
  createdAt: string;
  primitiveCalls: PrimitiveCall[] | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function truncateJson(value: unknown): string {
  const str = JSON.stringify(value, null, 2);
  if (str.length > 400) { return str.slice(0, 400) + "\n…"; }
  return str;
}

// ─── Tool Call Accordion ──────────────────────────────────────────────────────

function ToolCallsAccordion({ calls }: { calls: PrimitiveCall[] }): React.ReactElement {
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <div className="mt-2 space-y-1">
      {calls.map((call, i) => (
        <div key={i} className="bg-gray-50 border border-gray-200 rounded-xl overflow-hidden text-xs">
          <button
            type="button"
            onClick={() => setExpanded(expanded === i ? null : i)}
            className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-100 transition-colors"
          >
            <span className="text-gray-400">📊</span>
            <span className="font-mono font-medium text-gray-700 flex-1 truncate">{call.name}</span>
            <span className="text-gray-400">{expanded === i ? "▲" : "▼"}</span>
          </button>
          {expanded === i && (
            <div className="border-t border-gray-200 divide-y divide-gray-100">
              {call.input !== undefined && (
                <div className="px-3 py-2">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Input</p>
                  <pre className="text-xs text-gray-600 whitespace-pre-wrap font-mono overflow-auto max-h-32">
                    {truncateJson(call.input)}
                  </pre>
                </div>
              )}
              {call.output !== undefined && (
                <div className="px-3 py-2">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Output</p>
                  <pre className="text-xs text-gray-600 whitespace-pre-wrap font-mono overflow-auto max-h-32">
                    {truncateJson(call.output)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Bubble ───────────────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: Message }): React.ReactElement {
  const isOwner = msg.direction === "inbound";

  if (msg.role === "system") {
    return (
      <div className="flex justify-center">
        <p className="text-[11px] text-gray-400 bg-gray-100 px-3 py-1 rounded-full">{msg.content}</p>
      </div>
    );
  }

  return (
    <div className={`flex ${isOwner ? "justify-end" : "justify-start"}`}>
      <div className="max-w-[75%]">
        <div
          className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
            isOwner
              ? "bg-[#534AB7] text-white rounded-br-sm"
              : "bg-white border border-gray-200 text-gray-800 rounded-bl-sm"
          }`}
        >
          {msg.content}
        </div>
        {msg.primitiveCalls && msg.primitiveCalls.length > 0 && (
          <ToolCallsAccordion calls={msg.primitiveCalls} />
        )}
        <p className={`text-[10px] text-gray-400 mt-1 ${isOwner ? "text-right" : "text-left"}`}>
          {formatTime(msg.createdAt)}
        </p>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const PAGE = 50;

export default function ChatLogPage(): React.ReactElement {
  const { buildHeaders } = useApiClient();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  // Tracks pagination offset without triggering re-renders
  const offsetRef = useRef(0);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadMessages = useCallback(async (offset: number, prepend: boolean) => {
    try {
      const res = await fetch(
        `${API_URL}/api/dashboard/messages?limit=${PAGE}&offset=${offset}`,
        { headers: await buildHeaders() }
      );
      if (!res.ok) { throw new Error("Failed to load messages"); }
      const rows = (await res.json()) as Message[];
      setHasMore(rows.length === PAGE);
      setMessages((prev) => (prepend ? [...rows, ...prev] : rows));
    } catch {
      setError("Could not load messages.");
    }
  }, [buildHeaders]);

  // Initial load
  useEffect(() => {
    offsetRef.current = 0;
    setLoading(true);
    loadMessages(0, false).finally(() => setLoading(false));
  }, [loadMessages]);

  // Debounced search
  useEffect(() => {
    if (searchTimeout.current) { clearTimeout(searchTimeout.current); }

    if (!searchQuery.trim()) {
      setSearching(false);
      offsetRef.current = 0;
      void loadMessages(0, false);
      return;
    }

    setSearching(true);
    searchTimeout.current = setTimeout(async () => {
      offsetRef.current = 0;
      try {
        const res = await fetch(
          `${API_URL}/api/dashboard/messages/search?q=${encodeURIComponent(searchQuery)}`,
          { headers: await buildHeaders() }
        );
        if (!res.ok) { throw new Error(); }
        setMessages((await res.json()) as Message[]);
        setHasMore(false);
      } catch {
        setError("Search failed.");
      } finally {
        setSearching(false);
      }
    }, 350);

    return () => {
      if (searchTimeout.current) { clearTimeout(searchTimeout.current); }
    };
  }, [searchQuery, buildHeaders, loadMessages]);

  async function loadMore(): Promise<void> {
    offsetRef.current += PAGE;
    setLoadingMore(true);
    await loadMessages(offsetRef.current, true);
    setLoadingMore(false);
  }

  return (
    <div className="flex flex-col h-full max-w-2xl space-y-4">
      {/* Header */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Chat Log</h1>
          <p className="text-sm text-gray-500 mt-1">Every message between you and Kommand.</p>
        </div>
        <div className="relative">
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search messages…"
            className="border border-gray-200 rounded-xl px-4 py-2 text-sm w-52 focus:outline-none focus:ring-2 focus:ring-[#534AB7]/30 focus:border-[#534AB7] transition-colors"
          />
          {searching && (
            <div className="absolute right-3 top-2.5 w-4 h-4 border-2 border-[#534AB7] border-t-transparent rounded-full animate-spin" />
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 bg-gray-50 rounded-2xl border border-gray-200 overflow-hidden flex flex-col">
        {loading ? (
          <div className="flex-1 flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-[#534AB7] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-16 text-center px-6">
            <span className="text-4xl mb-3">💬</span>
            <p className="text-gray-500 text-sm font-medium">
              {searchQuery ? "No messages match your search." : "No messages yet."}
            </p>
            {!searchQuery && (
              <p className="text-gray-400 text-sm mt-1">
                Send a WhatsApp message to Kommand to get started.
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-col">
            {hasMore && !searchQuery && (
              <div className="flex justify-center py-3 border-b border-gray-200">
                <button
                  type="button"
                  onClick={() => { void loadMore(); }}
                  disabled={loadingMore}
                  className="text-xs text-[#534AB7] hover:underline disabled:opacity-50"
                >
                  {loadingMore ? "Loading…" : "Load older messages"}
                </button>
              </div>
            )}
            <div className="p-4 space-y-3 overflow-y-auto max-h-[calc(100vh-16rem)]">
              {messages.map((msg) => (
                <MessageBubble key={msg.id} msg={msg} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
