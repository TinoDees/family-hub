"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Retailer } from "@/lib/grocery-data";
import {
  startVisitInline,
  cancelVisitInline,
  finishVisitInline,
  scanVisitReceipt,
  applyVisitReceipt,
  type ActiveVisit,
} from "@/lib/actions/store-visits";
import type { ReceiptLine } from "@/lib/actions/shopping-receipt";

/**
 * Trip mode: "▶ Start shopping at Aldi" → tick as you shop (ticks are tagged
 * to this stop) → "🧾 Finish & scan receipt" → prices recorded per retailer
 * in price_records, stop closes, leftovers wait for the next store.
 */

export function ShoppingSession({
  activeVisit,
  retailers,
  tickedThisStop,
  items,
  canEdit,
}: {
  activeVisit: ActiveVisit | null;
  retailers: Retailer[];
  tickedThisStop: number;
  items: { id: string; name: string }[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [choice, setChoice] = useState("");
  const [customStore, setCustomStore] = useState("");
  const [busy, setBusy] = useState<null | "start" | "scan" | "apply" | "finish" | "cancel">(null);
  const [error, setError] = useState<string | null>(null);
  const [scan, setScan] = useState<{
    path: string;
    store: string | null;
    total: string;
    lines: (ReceiptLine & { include: boolean })[];
  } | null>(null);

  if (!canEdit) return null;

  async function start() {
    if (busy) return;
    const retailerId = choice && choice !== "__other" ? choice : null;
    const label = choice === "__other" ? customStore : null;
    if (!retailerId && !label?.trim()) {
      setError("Pick a store first");
      return;
    }
    setBusy("start");
    setError(null);
    const res = await startVisitInline(retailerId, label);
    setBusy(null);
    if (!res.ok) setError(res.error ?? "Could not start");
    else router.refresh();
  }

  async function onFile(file: File) {
    if (!activeVisit) return;
    setError(null);
    if (file.size > 5 * 1024 * 1024) {
      setError("Photo too large (max 5MB)");
      return;
    }
    setBusy("scan");
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = reject;
      r.readAsDataURL(file);
    });
    const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!m) {
      setBusy(null);
      setError("Could not read that file");
      return;
    }
    const res = await scanVisitReceipt(activeVisit.id, m[2], m[1]);
    setBusy(null);
    if (!res.ok || !res.path) {
      setError(res.error ?? "Scan failed");
      return;
    }
    setScan({
      path: res.path,
      store: res.store ?? activeVisit.store_label,
      total: res.total !== null && res.total !== undefined ? String(res.total) : "",
      lines: (res.lines ?? []).map((l) => ({ ...l, include: l.itemId !== null })),
    });
  }

  async function apply() {
    if (!scan || !activeVisit || busy) return;
    setBusy("apply");
    setError(null);
    const total = scan.total.trim() === "" ? null : parseFloat(scan.total);
    const res = await applyVisitReceipt(
      activeVisit.id,
      scan.path,
      scan.store,
      total !== null && !isNaN(total) ? total : null,
      scan.lines
        .filter((l) => l.include && l.itemId)
        .map((l) => ({ itemId: l.itemId!, price: l.price, label: l.label }))
    );
    setBusy(null);
    if (!res.ok) {
      setError(res.error ?? "Could not save");
      return;
    }
    setScan(null);
    router.refresh();
  }

  async function simple(kind: "finish" | "cancel") {
    if (!activeVisit || busy) return;
    setBusy(kind);
    setError(null);
    const res = kind === "finish"
      ? await finishVisitInline(activeVisit.id)
      : await cancelVisitInline(activeVisit.id);
    setBusy(null);
    if (!res.ok) setError(res.error ?? "Something went wrong");
    else router.refresh();
  }

  const matched = scan?.lines.filter((l) => l.itemId && l.include).length ?? 0;

  return (
    <div
      className={`rounded-xl border px-4 py-3 ${
        activeVisit ? "border-teal-300 bg-teal-50/70" : "border-stone-200 bg-white"
      }`}
    >
      {!activeVisit ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">🛒 At the shops?</span>
          <select
            value={choice}
            onChange={(e) => setChoice(e.target.value)}
            className="rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm focus:outline-none"
          >
            <option value="">Start shopping at…</option>
            {retailers.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
            <option value="__other">somewhere else…</option>
          </select>
          {choice === "__other" && (
            <input
              value={customStore}
              onChange={(e) => setCustomStore(e.target.value)}
              placeholder="Store name"
              className="w-36 rounded-lg border border-stone-300 px-2.5 py-1.5 text-sm focus:border-teal-500 focus:outline-none"
            />
          )}
          <button
            type="button"
            disabled={busy !== null || !choice}
            onClick={start}
            className="rounded-lg bg-teal-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-teal-600 disabled:opacity-40"
          >
            {busy === "start" ? "Starting…" : "▶ Start"}
          </button>
          <span className="text-xs text-stone-400">
            — ticks get tagged to the stop, and the receipt prices what you bought.
          </span>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">
            🛒 Shopping at {activeVisit.store_label ?? "the shops"}
          </span>
          <span className="rounded-full bg-white px-2 py-0.5 text-xs text-stone-500">
            {tickedThisStop} ticked this stop
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => fileRef.current?.click()}
              className="rounded-lg bg-teal-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-teal-600 disabled:opacity-50"
            >
              {busy === "scan" ? "Reading receipt…" : "🧾 Finish & scan receipt"}
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => simple("finish")}
              className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-stone-100"
              title="Close this stop without a receipt"
            >
              Finish without receipt
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => simple("cancel")}
              className="rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs text-stone-400 hover:text-red-600"
              title="Abandon this stop"
            >
              ✕
            </button>
          </div>
        </div>
      )}
      {error && !scan && <p className="mt-1.5 text-xs text-red-600">{error}</p>}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />

      {scan && activeVisit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => busy === null && setScan(null)}>
          <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="border-b border-stone-100 px-5 py-4">
              <h3 className="text-sm font-semibold">🧾 {scan.store ?? "Receipt"} — finishing this stop</h3>
              <div className="mt-2 flex items-center gap-2 text-sm">
                <span className="text-stone-500">Total paid</span>
                <span className="font-medium">$</span>
                <input
                  value={scan.total}
                  onChange={(e) => setScan({ ...scan, total: e.target.value.replace(/[^\d.]/g, "") })}
                  inputMode="decimal"
                  className="w-24 rounded-lg border border-stone-300 px-2 py-1 text-sm focus:border-teal-500 focus:outline-none"
                />
                <span className="ml-auto text-xs text-stone-400">
                  {matched} of {scan.lines.length} lines matched
                </span>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
              {scan.lines.length === 0 ? (
                <p className="py-6 text-center text-sm text-stone-400">
                  No line items could be read — the total and receipt are still recorded.
                </p>
              ) : (
                <ul className="divide-y divide-stone-100">
                  {scan.lines.map((l, idx) => (
                    <li key={idx} className={`flex items-center gap-2 py-2 ${l.include ? "" : "opacity-40"}`}>
                      <input
                        type="checkbox"
                        checked={l.include}
                        onChange={(e) =>
                          setScan((s) => s && {
                            ...s,
                            lines: s.lines.map((x, i) => (i === idx ? { ...x, include: e.target.checked } : x)),
                          })
                        }
                        className="h-4 w-4 shrink-0 accent-teal-700"
                      />
                      <span className="min-w-0 flex-1 truncate text-xs" title={l.label}>{l.label}</span>
                      <span className="shrink-0 text-xs font-medium">${l.price.toFixed(2)}</span>
                      <select
                        value={l.itemId ?? ""}
                        onChange={(e) =>
                          setScan((s) => s && {
                            ...s,
                            lines: s.lines.map((x, i) =>
                              i === idx
                                ? { ...x, itemId: e.target.value || null, include: e.target.value ? true : x.include }
                                : x
                            ),
                          })
                        }
                        className={`w-36 shrink-0 rounded-lg border px-1.5 py-1 text-xs focus:outline-none ${
                          l.itemId ? "border-stone-200 bg-white" : "border-amber-300 bg-amber-50"
                        }`}
                      >
                        <option value="">not on the list</option>
                        {items.map((i) => (
                          <option key={i.id} value={i.id}>{i.name}</option>
                        ))}
                      </select>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-stone-100 px-5 py-4">
              {error ? (
                <p className="text-xs text-red-600">{error}</p>
              ) : (
                <p className="text-xs text-stone-400">Every line is recorded against this store for price history.</p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => setScan(null)}
                  className="rounded-lg border border-stone-300 px-4 py-1.5 text-sm hover:bg-stone-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={apply}
                  className="rounded-lg bg-teal-700 px-5 py-1.5 text-sm font-medium text-white hover:bg-teal-600 disabled:opacity-50"
                >
                  {busy === "apply" ? "Saving…" : `Finish stop${scan.total ? ` — $${scan.total}` : ""}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
