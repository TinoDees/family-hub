"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/client";
import {
  createDocument,
  updateDocument,
  extractDocument,
  type ExtractedDocument,
} from "@/lib/actions/documents";
import { DOC_TYPES, OBLIGATION_KINDS, FREQUENCIES } from "@/lib/document-types";
import { inputCls } from "@/components/auth-card";

const DocScannerModal = dynamic(() => import("@/components/doc-scanner-modal"), { ssr: false });

const ALLOWED_MIMES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const MAX_FILE_BYTES = 10 * 1024 * 1024;
// base64 travels through a server action body (next.config caps it at 8mb)
const MAX_EXTRACT_BYTES = Math.floor(5.5 * 1024 * 1024);

const labelCls = "block text-xs font-medium text-stone-500";

type ObRow = {
  key: string;
  kind: string;
  amount: string;
  frequency: string;
  next_due_date: string;
  interest_rate: string;
  balloon_amount: string;
  balloon_date: string;
};

export type DocumentFormInitial = {
  id: string;
  title: string;
  doc_type: string;
  provider: string | null;
  reference_no: string | null;
  notes: string | null;
  start_date: string | null;
  expiry_date: string | null;
  storage_path: string | null;
  obligations: {
    kind: string | null;
    amount: number | null;
    frequency: string | null;
    next_due_date: string | null;
    interest_rate: number | null;
    balloon_amount: number | null;
    balloon_date: string | null;
  }[];
};

function emptyRow(): ObRow {
  return {
    key: crypto.randomUUID(),
    kind: "repayment",
    amount: "",
    frequency: "monthly",
    next_due_date: "",
    interest_rate: "",
    balloon_amount: "",
    balloon_date: "",
  };
}

/** Resize images client-side so the base64 fits through a server action. */
async function imageToBase64(file: File): Promise<{ data: string; mediaType: string }> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/webp", 0.85);
    return { data: dataUrl.split(",")[1], mediaType: "image/webp" };
  } catch {
    return { data: await rawBase64(file), mediaType: file.type || "image/jpeg" };
  }
}

async function rawBase64(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < buf.length; i += 0x8000) {
    binary += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export function DocumentForm({
  householdId,
  initial,
}: {
  householdId: string;
  /** present = edit mode */
  initial?: DocumentFormInitial;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [readDone, setReadDone] = useState(false);

  const [title, setTitle] = useState(initial?.title ?? "");
  const [docType, setDocType] = useState(initial?.doc_type ?? "other");
  const [provider, setProvider] = useState(initial?.provider ?? "");
  const [referenceNo, setReferenceNo] = useState(initial?.reference_no ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [startDate, setStartDate] = useState(initial?.start_date ?? "");
  const [expiryDate, setExpiryDate] = useState(initial?.expiry_date ?? "");
  const [rows, setRows] = useState<ObRow[]>(
    (initial?.obligations ?? []).map((o) => ({
      key: crypto.randomUUID(),
      kind: o.kind ?? "repayment",
      amount: o.amount !== null && o.amount !== undefined ? String(o.amount) : "",
      frequency: o.frequency ?? "",
      next_due_date: o.next_due_date ?? "",
      interest_rate:
        o.interest_rate !== null && o.interest_rate !== undefined ? String(o.interest_rate) : "",
      balloon_amount:
        o.balloon_amount !== null && o.balloon_amount !== undefined
          ? String(o.balloon_amount)
          : "",
      balloon_date: o.balloon_date ?? "",
    }))
  );

  const pickFile = (f: File | null) => {
    setMsg(null);
    setReadDone(false);
    if (!f) return setFile(null);
    if (!ALLOWED_MIMES.includes(f.type)) {
      setMsg("That file type isn't supported — use a PDF, JPG, PNG or WEBP.");
      return;
    }
    if (f.size > MAX_FILE_BYTES) {
      setMsg("That file is over 10 MB — try a smaller scan or photo.");
      return;
    }
    setFile(f);
  };

  const applyExtracted = (d: ExtractedDocument) => {
    if (d.title) setTitle((v) => v || d.title!);
    if (d.doc_type) setDocType(d.doc_type);
    if (d.provider) setProvider(d.provider);
    if (d.reference_no) setReferenceNo(d.reference_no);
    if (d.start_date) setStartDate(d.start_date);
    if (d.expiry_date) setExpiryDate(d.expiry_date);
    if (d.obligations.length > 0) {
      setRows(
        d.obligations.map((o) => ({
          key: crypto.randomUUID(),
          kind: o.kind ?? "repayment",
          amount: o.amount !== null ? String(o.amount) : "",
          frequency: o.frequency ?? "",
          next_due_date: o.next_due_date ?? "",
          interest_rate: o.interest_rate !== null ? String(o.interest_rate) : "",
          balloon_amount: o.balloon_amount !== null ? String(o.balloon_amount) : "",
          balloon_date: o.balloon_date !== null ? o.balloon_date : "",
        }))
      );
    }
  };

  const readItForMe = async () => {
    if (!file || reading) return;
    setReading(true);
    setMsg("Reading your document…");
    try {
      let data: string;
      let mediaType: string;
      if (file.type === "application/pdf") {
        if (file.size > MAX_EXTRACT_BYTES) {
          setMsg("This PDF is too big to read automatically — fill the form in yourself.");
          return;
        }
        data = await rawBase64(file);
        mediaType = "application/pdf";
      } else {
        ({ data, mediaType } = await imageToBase64(file));
      }
      const res = await extractDocument(data, mediaType);
      if (!res.ok || !res.data) {
        setMsg(res.error ?? "Couldn't read that — fill the form in yourself.");
        return;
      }
      applyExtracted(res.data);
      setReadDone(true);
      setMsg("Here's what I could read — check it over, fix anything, then save.");
    } catch {
      setMsg("Couldn't read that — fill the form in yourself.");
    } finally {
      setReading(false);
    }
  };

  const setRow = (key: string, patch: Partial<ObRow>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const save = async () => {
    if (saving) return;
    if (!title.trim()) {
      setMsg("Give it a name first — that's the only thing it needs.");
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      // upload straight to storage (RLS-protected) so big PDFs fit
      let storagePath = "";
      let mime = "";
      if (file) {
        const ext =
          file.type === "application/pdf"
            ? "pdf"
            : file.type === "image/png"
              ? "png"
              : file.type === "image/webp"
                ? "webp"
                : "jpg";
        storagePath = `${householdId}/${crypto.randomUUID()}.${ext}`;
        mime = file.type;
        const supabase = createClient();
        const { error } = await supabase.storage
          .from("documents")
          .upload(storagePath, file, { contentType: file.type });
        if (error) {
          setMsg(`Couldn't upload the file: ${error.message}`);
          return;
        }
      }

      const num = (s: string) => {
        const n = parseFloat(s);
        return isNaN(n) ? null : n;
      };
      const obligations = rows
        .map((r) => ({
          kind: r.kind,
          amount: num(r.amount),
          frequency: r.frequency || null,
          next_due_date: r.next_due_date || null,
          interest_rate: num(r.interest_rate),
          balloon_amount: num(r.balloon_amount),
          balloon_date: r.balloon_date || null,
        }))
        .filter(
          (o) =>
            o.amount !== null ||
            o.next_due_date !== null ||
            o.interest_rate !== null ||
            o.balloon_amount !== null
        );

      const fd = new FormData();
      fd.set("title", title.trim());
      fd.set("doc_type", docType);
      fd.set("provider", provider);
      fd.set("reference_no", referenceNo);
      fd.set("notes", notes);
      fd.set("start_date", startDate);
      fd.set("expiry_date", expiryDate);
      fd.set("obligations", JSON.stringify(obligations));
      if (storagePath) {
        fd.set("storage_path", storagePath);
        fd.set("mime", mime);
      }
      if (initial) fd.set("document_id", initial.id);

      const res = initial ? await updateDocument(fd) : await createDocument(fd);
      if (!res.ok || !res.id) {
        setMsg(res.error ?? "Could not save — try again.");
        return;
      }
      router.push(`/documents/${res.id}`);
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {scannerOpen && (
        <DocScannerModal onClose={() => setScannerOpen(false)} onCapture={pickFile} />
      )}

      {/* ── the paper itself ─────────────────────────────────────────── */}
      <div className="rounded-xl border border-stone-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setScannerOpen(true)}
            className="rounded-lg bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-700"
          >
            📷 Scan the paper
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium hover:bg-stone-100"
          >
            📎 Upload a file
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
          />
          {file && (
            <button
              type="button"
              onClick={readItForMe}
              disabled={reading}
              className="rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-500 disabled:opacity-60"
            >
              {reading ? "Reading…" : "✨ Read it for me"}
            </button>
          )}
        </div>
        <p className="mt-2 text-xs text-stone-400">
          {file
            ? `Attached: ${file.name}`
            : initial?.storage_path
              ? "A file is already attached — scan or upload to replace it."
              : "PDF or photo, up to 10 MB. Attach it and Nestly can read the details for you."}
        </p>
        {msg && (
          <p
            className={`mt-2 rounded-lg px-3 py-2 text-sm ${
              readDone ? "bg-teal-50 text-teal-700" : "bg-amber-50 text-amber-700"
            }`}
          >
            {msg}
          </p>
        )}
      </div>

      {/* ── what is it? ──────────────────────────────────────────────── */}
      <div className="rounded-xl border border-stone-200 bg-white p-4">
        <span className={labelCls}>What is it?</span>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {DOC_TYPES.map((t) => (
            <button
              key={t.slug}
              type="button"
              onClick={() => setDocType(t.slug)}
              className={`rounded-lg border px-2 py-2 text-left text-sm transition-colors ${
                docType === t.slug
                  ? "border-teal-500 bg-teal-50 font-medium text-teal-900"
                  : "border-stone-200 hover:bg-stone-50"
              }`}
            >
              <span className="mr-1.5">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className={labelCls}>Give it a name</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder='e.g. "Home loan", "Car insurance — Corolla"'
              className={`mt-1 ${inputCls}`}
            />
          </label>
          <label className="block">
            <span className={labelCls}>Who is it with?</span>
            <input
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              placeholder="Bank, insurer, shop…"
              className={`mt-1 ${inputCls}`}
            />
          </label>
          <label className="block">
            <span className={labelCls}>Reference number</span>
            <input
              value={referenceNo}
              onChange={(e) => setReferenceNo(e.target.value)}
              placeholder="Account / policy number"
              className={`mt-1 ${inputCls}`}
            />
          </label>
          <label className="block">
            <span className={labelCls}>When did it start?</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={`mt-1 ${inputCls}`}
            />
          </label>
          <label className="block">
            <span className={labelCls}>When does it end or expire?</span>
            <input
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              className={`mt-1 ${inputCls}`}
            />
          </label>
          <label className="block sm:col-span-2">
            <span className={labelCls}>Anything to remember?</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Excess is $800, receipt is in the kitchen drawer…"
              className={`mt-1 ${inputCls}`}
            />
          </label>
        </div>
      </div>

      {/* ── the money side ───────────────────────────────────────────── */}
      <div className="rounded-xl border border-stone-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <span className={labelCls}>Regular payments (optional)</span>
          <button
            type="button"
            onClick={() => setRows((rs) => [...rs, emptyRow()])}
            className="rounded-lg border border-stone-300 px-2.5 py-1 text-xs font-medium hover:bg-stone-100"
          >
            + Add a payment
          </button>
        </div>
        {rows.length === 0 ? (
          <p className="mt-2 text-sm text-stone-400">
            Repayments, premiums, fees… add one and Nestly can remind you before it&apos;s due.
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            {rows.map((r) => (
              <div key={r.key} className="rounded-lg border border-stone-200 bg-stone-50 p-3">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <label className="block">
                    <span className={labelCls}>What kind?</span>
                    <select
                      value={r.kind}
                      onChange={(e) => setRow(r.key, { kind: e.target.value })}
                      className={`mt-1 ${inputCls}`}
                    >
                      {OBLIGATION_KINDS.map((k) => (
                        <option key={k.slug} value={k.slug}>
                          {k.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className={labelCls}>How much?</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={r.amount}
                      onChange={(e) => setRow(r.key, { amount: e.target.value })}
                      placeholder="482.00"
                      className={`mt-1 ${inputCls}`}
                    />
                  </label>
                  <label className="block">
                    <span className={labelCls}>How often?</span>
                    <select
                      value={r.frequency}
                      onChange={(e) => setRow(r.key, { frequency: e.target.value })}
                      className={`mt-1 ${inputCls}`}
                    >
                      <option value="">—</option>
                      {FREQUENCIES.map((f) => (
                        <option key={f.slug} value={f.slug}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className={labelCls}>Next due?</span>
                    <input
                      type="date"
                      value={r.next_due_date}
                      onChange={(e) => setRow(r.key, { next_due_date: e.target.value })}
                      className={`mt-1 ${inputCls}`}
                    />
                  </label>
                  <label className="block">
                    <span className={labelCls}>Interest rate %</span>
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      value={r.interest_rate}
                      onChange={(e) => setRow(r.key, { interest_rate: e.target.value })}
                      placeholder="5.99"
                      className={`mt-1 ${inputCls}`}
                    />
                  </label>
                  <label className="block">
                    <span className={labelCls}>Balloon payment?</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={r.balloon_amount}
                      onChange={(e) => setRow(r.key, { balloon_amount: e.target.value })}
                      placeholder="Big final payment"
                      className={`mt-1 ${inputCls}`}
                    />
                  </label>
                  <label className="block">
                    <span className={labelCls}>Balloon due</span>
                    <input
                      type="date"
                      value={r.balloon_date}
                      onChange={(e) => setRow(r.key, { balloon_date: e.target.value })}
                      className={`mt-1 ${inputCls}`}
                    />
                  </label>
                  <div className="flex items-end justify-end">
                    <button
                      type="button"
                      onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                      className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-60"
        >
          {saving ? "Saving…" : initial ? "Save changes" : "Save document"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium hover:bg-stone-100"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
