"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { refreshGoogleShelf, disconnectGoogle } from "@/lib/actions/library";

function ago(iso: string | null): string | null {
  if (!iso) return null;
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/**
 * The member's own Google connection card: connect / refresh / disconnect.
 * Each family member connects their OWN Google account — the combined shelf
 * below shows everyone's cached Play Books.
 */
export function GoogleShelfControls({
  connected,
  email,
  lastSynced,
  othersConnected,
}: {
  connected: boolean;
  email: string | null;
  lastSynced: string | null;
  othersConnected: number;
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () =>
    startTransition(async () => {
      setError(null);
      setMessage(null);
      const res = await refreshGoogleShelf();
      if (res.ok) {
        setMessage(
          res.count === 0
            ? "Synced — Google reports no books on your shelves yet."
            : `Synced ${res.count} title${res.count === 1 ? "" : "s"} from your Google shelf.`
        );
        router.refresh();
      } else {
        setError(res.error ?? "Sync failed — try again.");
      }
    });

  const disconnect = () => {
    if (!window.confirm("Disconnect your Google account? Your cached Play Books disappear from the family shelf.")) return;
    startTransition(async () => {
      setError(null);
      setMessage(null);
      const res = await disconnectGoogle();
      if (res.ok) router.refresh();
      else setError(res.error ?? "Could not disconnect — try again.");
    });
  };

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          {connected ? (
            <>
              <span className="font-medium text-stone-700">
                ✅ Your Google account is connected
              </span>
              <span className="text-stone-400">
                {email ? ` (${email})` : ""}
                {lastSynced ? ` · synced ${ago(lastSynced)}` : ""}
              </span>
            </>
          ) : (
            <span className="text-stone-500">
              Connect your Google account to show your Play Books here.
              {othersConnected > 0 &&
                ` ${othersConnected} family member${othersConnected === 1 ? " has" : "s have"} already connected.`}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {connected ? (
            <>
              <button
                onClick={refresh}
                disabled={busy}
                className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-600 hover:bg-stone-50 disabled:opacity-50"
              >
                {busy ? "Syncing…" : "🔄 Refresh shelf"}
              </button>
              <button
                onClick={disconnect}
                disabled={busy}
                className="rounded-lg px-3 py-1.5 text-sm text-stone-400 hover:text-red-600 disabled:opacity-50"
              >
                Disconnect
              </button>
            </>
          ) : (
            <a
              href="/api/google-books/connect"
              className="rounded-lg bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-700"
            >
              Connect Google
            </a>
          )}
        </div>
      </div>
      {message && <p className="mt-2 text-sm text-teal-700">{message}</p>}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
