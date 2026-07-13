"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { addExpense } from "@/lib/actions/trips";
import { addGuestExpense } from "@/lib/actions/guest-trip";
import { scanReceipt } from "@/lib/actions/receipts";

const DocScannerModal = dynamic(() => import("@/components/doc-scanner-modal"), { ssr: false });

type Participant = { id: string; name: string };

async function toResizedBase64(file: File): Promise<{ data: string; mediaType: string }> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/webp", 0.8);
    return { data: dataUrl.split(",")[1], mediaType: "image/webp" };
  } catch {
    // fallback: original file
    const buf = await file.arrayBuffer();
    let binary = "";
    const arr = new Uint8Array(buf);
    for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]);
    return { data: btoa(binary), mediaType: file.type || "image/jpeg" };
  }
}

const inputCls =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 outline-none focus:border-stone-500 focus:ring-2 focus:ring-stone-200";

export function AddExpenseForm({
  tripId,
  participants,
  guestParticipantId,
}: {
  tripId: string;
  participants: Participant[];
  /** set for trip guests: locks payer to themselves and uses the guest action */
  guestParticipantId?: string;
}) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [receiptPhotoId, setReceiptPhotoId] = useState("");
  const [items, setItems] = useState<{ description: string; amount: number }[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);

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
      if (res.items && res.items.length > 0) setItems(res.items);
      if (res.merchant) setDescription(res.merchant);
      if (res.total) setAmount(String(res.total));
      if (res.date) setDate(res.date);
      setScanMsg(
        res.error ??
          (res.merchant || res.total
            ? "Receipt read — check the details and add."
            : "Receipt saved — couldn't read details, fill in manually.")
      );
    } finally {
      setScanning(false);
    }
  };

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
    <form action={guestParticipantId ? addGuestExpense : addExpense} className="space-y-3 rounded-xl border border-stone-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Add expense</h2>
        <button
          type="button"
          disabled={scanning}
          onClick={() => setScannerOpen(true)}
          className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${scanning ? "border-stone-200 text-stone-400" : "border-stone-300 hover:bg-stone-100"}`}
        >
          {scanning ? "Reading…" : "📷 Scan receipt"}
        </button>
      </div>
      {scanMsg && <p className="rounded-lg bg-sky-50 px-3 py-1.5 text-xs text-sky-800">{scanMsg}</p>}

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-44 flex-1">
          <label className="mb-1 block text-xs font-medium">Description</label>
          <input
            name="description"
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Dinner at the surf club"
            className={inputCls}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium">Amount</label>
          <input
            name="amount"
            type="number"
            step="0.01"
            min="0.01"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className={`${inputCls} w-28`}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium">Date</label>
          <input
            name="spent_at"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={inputCls}
          />
        </div>
        {!guestParticipantId && (
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
      <div>
        <div className="mb-1 text-xs font-medium">Split between</div>
        <div className="flex flex-wrap gap-3">
          {participants.map((p) => (
            <label key={p.id} className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" name="shared_with" value={p.id} defaultChecked className="rounded border-stone-300" />
              {p.name}
            </label>
          ))}
        </div>
      </div>
      <input type="hidden" name="trip_id" value={tripId} />
      <input type="hidden" name="receipt_photo_id" value={receiptPhotoId} />
      <input type="hidden" name="items_json" value={JSON.stringify(items)} />
      {items.length > 0 && (
        <p className="text-xs text-stone-400">
          {items.length} line item{items.length === 1 ? "" : "s"} captured — allocate them per person
          after adding (click the expense).
        </p>
      )}
      <button className="rounded-lg bg-stone-900 px-5 py-2 text-sm font-medium text-white hover:bg-stone-700">
        Add — split equally
      </button>
    </form>
    </>
  );
}
