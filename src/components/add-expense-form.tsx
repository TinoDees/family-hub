"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { addExpense, createParticipantInline } from "@/lib/actions/trips";
import { addGuestExpense } from "@/lib/actions/guest-trip";
import { scanReceipt } from "@/lib/actions/receipts";
import { SubmitButton } from "@/components/submit-button";

const DocScannerModal = dynamic(() => import("@/components/doc-scanner-modal"), { ssr: false });

type Participant = { id: string; name: string };
type Item = { description: string; amount: number; original_amount?: number; consumed_by: string };

async function toResizedBase64(file: File): Promise<{ data: string; mediaType: string }> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/webp", 0.8);
    return { data: dataUrl.split(",")[1], mediaType: "image/webp" };
  } catch {
    const buf = await file.arrayBuffer();
    let binary = "";
    const arr = new Uint8Array(buf);
    for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]);
    return { data: btoa(binary), mediaType: file.type || "image/jpeg" };
  }
}

function money(n: number) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", currencyDisplay: "narrowSymbol" }).format(n);
}

const inputCls =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 outline-none focus:border-stone-500 focus:ring-2 focus:ring-stone-200";

export function AddExpenseForm({
  tripId,
  participants: initialParticipants,
  guestParticipantId,
}: {
  tripId: string;
  participants: Participant[];
  /** set for trip guests: locks payer to themselves and uses the guest action */
  guestParticipantId?: string;
}) {
  const [participants, setParticipants] = useState(initialParticipants);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [receiptPhotoId, setReceiptPhotoId] = useState("");
  const [originalAmount, setOriginalAmount] = useState("");
  const [originalCurrency, setOriginalCurrency] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [isTreat, setIsTreat] = useState(false);
  const [sharedWith, setSharedWith] = useState<Set<string>>(new Set(initialParticipants.map((p) => p.id)));
  const [scanning, setScanning] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const isGuest = Boolean(guestParticipantId);

  const onReceipt = async (file: File) => {
    setScanning(true);
    setScanMsg("Reading receipt…");
    try {
      const { data, mediaType } = await toResizedBase64(file);
      const res = await scanReceipt(tripId, data, mediaType);
      if (!res.ok) {
        setScanMsg(res.error ?? "Scan failed");
        return;
      }
      if (res.photoId) setReceiptPhotoId(res.photoId);
      if (res.items && res.items.length > 0)
        setItems(res.items.map((i) => ({ ...i, consumed_by: "" })));
      if (res.merchant) setDescription(res.merchant);
      if (res.total) setAmount(String(res.total));
      if (res.date) setDate(res.date);
      if (res.originalTotal && res.originalCurrency) {
        setOriginalAmount(String(res.originalTotal));
        setOriginalCurrency(res.originalCurrency);
      } else {
        setOriginalAmount("");
        setOriginalCurrency(res.originalCurrency ?? "");
      }
      const fxNote =
        res.originalTotal && res.originalCurrency && res.fxRate
          ? ` Converted from ${res.originalCurrency} ${res.originalTotal} at ${res.fxRate.toFixed(4)}.`
          : "";
      setScanMsg(
        (res.error ??
          (res.items && res.items.length > 0
            ? `Receipt read — ${res.items.length} items below. Assign who had what (or leave shared) and add.`
            : "Receipt read — check the details and add.")) + fxNote
      );
    } finally {
      setScanning(false);
    }
  };

  const [newPersonFor, setNewPersonFor] = useState<number | "general" | null>(null);
  const [newPersonName, setNewPersonName] = useState("");

  const confirmAddPerson = async () => {
    if (!newPersonName.trim()) return;
    const target = newPersonFor;
    const res = await createParticipantInline(tripId, newPersonName);
    setNewPersonName("");
    setNewPersonFor(null);
    if (res.ok && res.id && res.name) {
      setParticipants((p) => [...p, { id: res.id!, name: res.name! }]);
      setSharedWith((s) => new Set([...s, res.id!]));
      if (typeof target === "number") {
        setItems((it) => it.map((r, i) => (i === target ? { ...r, consumed_by: res.id! } : r)));
      }
    } else {
      setScanMsg(res.error ?? "Could not add person");
    }
  };

  const setItemConsumer = (idx: number, value: string, addNew?: boolean) => {
    if (addNew) {
      setNewPersonFor(idx);
      return;
    }
    setItems((it) => it.map((r, i) => (i === idx ? { ...r, consumed_by: value } : r)));
  };

  const toggleShared = (pid: string) =>
    setSharedWith((s) => {
      const n = new Set(s);
      if (n.has(pid)) n.delete(pid);
      else n.add(pid);
      return n;
    });

  const preview = useMemo(() => {
    const amt = parseFloat(amount) || 0;
    const per = new Map<string, number>();
    let allocated = 0;
    for (const i of items) {
      if (i.consumed_by) {
        per.set(i.consumed_by, (per.get(i.consumed_by) ?? 0) + i.amount);
        allocated += i.amount;
      }
    }
    const pool = Math.round((amt - allocated) * 100) / 100;
    const list = [...sharedWith];
    if (pool > 0 && list.length > 0) {
      for (const pid of list) per.set(pid, (per.get(pid) ?? 0) + pool / list.length);
    }
    return { per, pool, over: pool < -0.004, hasAlloc: allocated > 0 };
  }, [items, amount, sharedWith]);

  return (
    <>
      {scannerOpen && (
        <DocScannerModal
          onClose={() => setScannerOpen(false)}
          onCapture={(file) => {
            setScannerOpen(false);
            onReceipt(file);
          }}
        />
      )}
      <form
        action={isGuest ? addGuestExpense : addExpense}
        className="space-y-3 rounded-xl border border-stone-200 bg-white p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Add expense</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={scanning}
              onClick={() => setScannerOpen(true)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${scanning ? "border-stone-200 text-stone-400" : "border-stone-300 hover:bg-stone-100"}`}
            >
              {scanning ? "Reading…" : "📷 Scan receipt"}
            </button>
            <label className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-medium ${scanning ? "border-stone-200 text-stone-400" : "border-stone-300 hover:bg-stone-100"}`}>
              🖼 From library
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={scanning}
                onChange={(e) => e.target.files?.[0] && onReceipt(e.target.files[0])}
              />
            </label>
          </div>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file && file.type.startsWith("image/") && !scanning) onReceipt(file);
          }}
          className={`hidden items-center justify-center rounded-lg border border-dashed px-3 py-2 text-xs transition-colors sm:flex ${
            dragOver ? "border-sky-400 bg-sky-50 text-sky-700" : "border-stone-200 text-stone-400"
          }`}
        >
          {dragOver ? "Drop it — I'll read it" : "…or drag a receipt image anywhere here"}
        </div>
        {scanMsg && <p className="rounded-lg bg-sky-50 px-3 py-1.5 text-xs text-sky-800">{scanMsg}</p>}

        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-44 flex-1">
            <label className="mb-1 block text-xs font-medium">Description</label>
            <input name="description" required value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Dinner at the surf club" className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Amount</label>
            <input name="amount" type="number" step="0.01" min="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className={`${inputCls} w-28`} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Date</label>
            <input name="spent_at" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
          </div>
          {!isGuest && (
            <div>
              <label className="mb-1 block text-xs font-medium">Paid by</label>
              <select name="paid_by" className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm">
                {participants.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {items.length > 0 && !isTreat && (
          <div className="space-y-1.5 rounded-xl border border-stone-100 bg-stone-50/60 p-3">
            <div className="text-xs font-medium text-stone-500">
              Who had what? Same item several times = one row each (e.g. give Tino two of the four).
            </div>
            {items.map((i, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="flex-1 truncate text-sm">
                  {i.description}
                  {items.filter((x) => x.description === i.description).length > 1 && (
                    <span className="ml-1 text-xs text-stone-400">
                      ({items.slice(0, idx + 1).filter((x) => x.description === i.description).length}/
                      {items.filter((x) => x.description === i.description).length})
                    </span>
                  )}
                </span>
                <span className="whitespace-nowrap text-right text-sm">
                  {i.original_amount != null && originalCurrency && (
                    <span className="mr-1.5 text-xs text-stone-400">
                      {originalCurrency} {i.original_amount.toLocaleString()}
                    </span>
                  )}
                  <span className="font-medium">{money(i.amount)}</span>
                </span>
                <select
                  value={i.consumed_by}
                  onChange={(e) => {
                    if (e.target.value === "__add__") setItemConsumer(idx, "", true);
                    else setItemConsumer(idx, e.target.value);
                  }}
                  className={`w-40 rounded-lg border px-2 py-1 text-xs ${i.consumed_by ? "border-emerald-300 bg-emerald-50" : "border-stone-200 bg-white"}`}
                >
                  <option value="">— shared —</option>
                  {participants.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                  {!isGuest && <option value="__add__">+ Add person…</option>}
                </select>
              </div>
            ))}
          </div>
        )}

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="is_treat"
            checked={isTreat}
            onChange={(e) => setIsTreat(e.target.checked)}
            className="rounded border-stone-300"
          />
          🎁 Our treat — don&apos;t split this one (the payer covers it all)
        </label>

        {newPersonFor !== null && (
          <div className="flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 p-2">
            <input
              value={newPersonName}
              onChange={(e) => setNewPersonName(e.target.value)}
              placeholder="Name of the new person"
              autoComplete="off"
              autoFocus
              className="flex-1 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  confirmAddPerson();
                }
              }}
            />
            <button type="button" onClick={confirmAddPerson} className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-medium text-white">
              Add
            </button>
            <button type="button" onClick={() => setNewPersonFor(null)} className="rounded-lg px-2 py-1.5 text-xs text-stone-400 hover:bg-stone-100">
              Cancel
            </button>
          </div>
        )}
        {!isTreat && (
        <div>
          <div className="mb-1 flex items-center gap-3 text-xs font-medium">
            <span>{preview.hasAlloc ? `Shared part (${money(Math.max(0, preview.pool))}) split between` : "Split between"}</span>
            {!isGuest && (
              <button type="button" onClick={() => setNewPersonFor("general")} className="text-xs text-sky-600 underline">
                + Add person
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-3">
            {participants.map((p) => (
              <label key={p.id} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  name="shared_with"
                  value={p.id}
                  checked={sharedWith.has(p.id)}
                  onChange={() => toggleShared(p.id)}
                  className="rounded border-stone-300"
                />
                {p.name}
              </label>
            ))}
          </div>
        </div>
        )}

        {(preview.hasAlloc || preview.over) && !isTreat && (
          <div className="rounded-xl bg-stone-50 p-3">
            {preview.over ? (
              <p className="text-sm text-red-600">Allocated items exceed the amount — check the numbers.</p>
            ) : (
              <ul className="space-y-0.5 text-sm">
                {participants
                  .filter((p) => (preview.per.get(p.id) ?? 0) > 0.004)
                  .map((p) => (
                    <li key={p.id} className="flex justify-between">
                      <span>{p.name}</span>
                      <span className="font-medium">{money(preview.per.get(p.id) ?? 0)}</span>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        )}

        <input type="hidden" name="trip_id" value={tripId} />
        <input type="hidden" name="receipt_photo_id" value={receiptPhotoId} />
      <input type="hidden" name="original_amount" value={originalAmount} />
      <input type="hidden" name="original_currency" value={originalCurrency} />
        <input type="hidden" name="items_json" value={JSON.stringify(items)} />
        {preview.over && !isTreat ? (
          <button disabled className="rounded-lg bg-stone-900 px-5 py-2 text-sm font-medium text-white opacity-40">
            Add
          </button>
        ) : (
          <SubmitButton
            label={isTreat ? "Add — our treat 🎁" : preview.hasAlloc ? "Add — exact split" : "Add — split equally"}
            pendingLabel="Adding…"
            className="rounded-lg bg-stone-900 px-5 py-2 text-sm font-medium text-white hover:bg-stone-700"
          />
        )}
      </form>
    </>
  );
}
