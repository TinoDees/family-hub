"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  scanShoppingReceipt,
  applyShoppingReceipt,
  type ReceiptLine,
} from "@/lib/actions/shopping-receipt";

/**
 * 📷 Scan receipt → Claude reads and auto-matches lines to the list's items →
 * a short review (tap-to-fix the stragglers) → prices saved, items ticked,
 * spend recorded. Built for the simplest possible brain-path: photo, glance,
 * one green button.
 */

export function ReceiptCapture({
  listId,
  items,
  canEdit,
}: {
  listId: string;
  items: { id: string; name: string }[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"scan" | "apply" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scan, setScan] = useState<{
    path: string;
    store: string | null;
    date: string | null;
    total: string;
    lines: (ReceiptLine & { include: boolean })[];
  } | null>(null);

  async function onFile(file: File) {
    setError(null);
    if (file.size > 5 * 1024 * 1024) {
      setError("Photo too large (max 5MB). Most phone cameras have a smaller size option.");
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
    const res = await scanShoppingReceipt(listId, m[2], m[1]);
    setBusy(null);
    if (!res.ok || !res.path) {
      setError(res.error ?? "Scan failed");
      return;
    }
    setScan({
      path: res.path,
      store: res.store ?? null,
      date: res.date ?? null,
      total: res.total !== null && res.total !== undefined ? String(res.total) : "",
      lines: (res.lines ?? []).map((l) => ({ ...l, include: l.itemId !== null })),
    });
  }

  async function apply() {
    if (!scan || busy) return;
    // sum multiple receipt lines assigned to the same item (2× milk = one price)
    const sums = new Map<string, number>();
    for (const l of scan.lines) {
      if (!l.include || !l.itemId) continue;
      sums.set(l.itemId, Math.round(((sums.get(l.itemId) ?? 0) + l.price) * 100) / 100);
    }
    setBusy("apply");
    setError(null);
    const total = scan.total.trim() === "" ? null : parseFloat(scan.total);
    const res = await applyShoppingReceipt(
      listId,
      scan.path,
      scan.store,
      total !== null && !isNaN(total) ? total : null,
      [...sums.entries()].map(([itemId, price]) => ({ itemId, price }))
    );
    setBusy(null);
    if (!res.ok) {
      setError(res.error ?? "Could not save");
      return;
    }
    setScan(null);
    router.refresh();
  }

  if (!canEdit) return null;

  const matched = scan?.lines.filter((l) => l.itemId && l.include).length ?? 0;

  return (
    <>
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
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => fileRef.current?.click()}
        className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium hover:bg-stone-100 disabled:opacity-50"
        title="Photograph the receipt. Prices land on the items automatically"
      >
        {busy === "scan" ? "Reading receipt…" : "📷 Scan receipt"}
      </button>
      {error && !scan && <p className="text-xs text-red-600">{error}</p>}

      {scan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => busy === null && setScan(null)}>
          <div
            className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-stone-100 px-5 py-4">
              <h3 className="text-sm font-semibold">
                🧾 {scan.store ?? "Receipt"}{scan.date ? ` · ${scan.date}` : ""}
              </h3>
              <div className="mt-2 flex items-center gap-2 text-sm">
                <span className="text-stone-500">Total paid</span>
                <span className="font-medium">$</span>
                <input
                  value={scan.total}
                  onChange={(e) =>
                    setScan({ ...scan, total: e.target.value.replace(/[^\d.]/g, "") })
                  }
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
                  No line items could be read. The total and receipt are still saved.
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
                        title="Include this line"
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
              {error ? <p className="text-xs text-red-600">{error}</p> : (
                <p className="text-xs text-stone-400">Matched items get their price and are ticked off.</p>
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
                  {busy === "apply" ? "Saving…" : `Save${scan.total ? ` $${scan.total}` : ""} to this list`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
