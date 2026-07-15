"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { importTransactions, type ImportRow } from "@/lib/actions/finance";

type Account = { id: string; name: string };

/** Tiny CSV parser handling quoted fields and commas. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function parseDate(raw: string): string | null {
  const s = raw.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); // ISO
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/); // dd/mm/yy(yy) — AU order
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return `${y}-${String(m[2]).padStart(2, "0")}-${String(m[1]).padStart(2, "0")}`;
  }
  m = s.match(/^(\d{1,2})\s+([A-Za-z]{3})\w*\s+(\d{2,4})$/); // 15 Jun 26
  if (m && MONTHS[m[2].toLowerCase()]) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return `${y}-${String(MONTHS[m[2].toLowerCase()]).padStart(2, "0")}-${String(m[1]).padStart(2, "0")}`;
  }
  return null;
}

function parseAmount(raw: string): number | null {
  let s = raw.trim().replace(/[$,\s]/g, "");
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  const n = parseFloat(s);
  if (isNaN(n)) return null;
  return negative ? -n : n;
}

function guessColumns(rows: string[][]) {
  // returns {date, amount, description, merchant, headerRows}
  const first = rows[0]?.map((c) => c.trim().toLowerCase()) ?? [];
  const hasHeader = first.some((c) => /date|amount|details|description|narrative/.test(c));
  const header = hasHeader ? first : null;
  const body = hasHeader ? rows.slice(1) : rows;
  const probe = body[0] ?? [];

  const find = (re: RegExp) => (header ? header.findIndex((c) => re.test(c)) : -1);
  const findFirst = (res: RegExp[]) => {
    for (const re of res) {
      const i = find(re);
      if (i >= 0) return i;
    }
    return -1;
  };
  let date = find(/date/);
  let amount = findFirst([/^amount/, /debit/, /value/]);
  let description = findFirst([/detail/, /description/, /narrative/, /memo/]);
  const merchant = findFirst([/merchant/, /payee/]);

  if (date < 0) date = probe.findIndex((c) => parseDate(c) !== null);
  if (amount < 0)
    amount = probe.findIndex((c, i) => i !== date && parseAmount(c) !== null && /\d/.test(c));
  if (description < 0)
    description = probe.findIndex(
      (c, i) => i !== date && i !== amount && c.trim().length > 3 && parseAmount(c) === null
    );
  return { date, amount, description, merchant, body, header };
}

export function CsvImport({ accounts }: { accounts: Account[] }) {
  const [raw, setRaw] = useState<string[][] | null>(null);
  const [fileName, setFileName] = useState("");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [cols, setCols] = useState<{ date: number; amount: number; description: number; merchant: number }>({ date: -1, amount: -1, description: -1, merchant: -1 });
  const [body, setBody] = useState<string[][]>([]);
  const [header, setHeader] = useState<string[] | null>(null);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  const onFile = async (f: File) => {
    const text = await f.text();
    const rows = parseCsv(text);
    const guess = guessColumns(rows);
    setRaw(rows);
    setBody(guess.body);
    setHeader(guess.header);
    setCols({ date: guess.date, amount: guess.amount, description: guess.description, merchant: guess.merchant });
    setFileName(f.name);
    setResult(null);
  };

  const parsed: ImportRow[] = useMemo(() => {
    if (!raw) return [];
    const out: ImportRow[] = [];
    for (const r of body) {
      const date = cols.date >= 0 ? parseDate(r[cols.date] ?? "") : null;
      const amount = cols.amount >= 0 ? parseAmount(r[cols.amount] ?? "") : null;
      const description = cols.description >= 0 ? (r[cols.description] ?? "").trim() : "";
      if (!date || amount === null || amount === 0 || !description) continue;
      out.push({
        date,
        amount,
        description,
        merchant: cols.merchant >= 0 ? (r[cols.merchant] ?? "").trim() || undefined : undefined,
      });
    }
    return out;
  }, [raw, body, cols]);

  const colCount = body[0]?.length ?? 0;
  const colOptions = Array.from({ length: colCount }, (_, i) => i);
  const setCol = (key: keyof typeof cols, v: number) => setCols((c) => ({ ...c, [key]: v }));

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-stone-200 bg-white p-6">
        <label className="block text-sm font-medium">Bank CSV file</label>
        <p className="mt-1 text-xs text-stone-400">
          NAB internet banking → Transaction history → Export → CSV. Other banks&apos; CSVs work too.
        </p>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          className="mt-3 block text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-stone-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-stone-700"
        />
        {fileName && (
          <p className="mt-2 text-xs text-stone-500">
            {fileName} — {body.length} rows, {parsed.length} usable transactions
          </p>
        )}
      </div>

      {raw && (
        <>
          <div className="flex flex-wrap items-end gap-3 rounded-xl border border-stone-200 bg-white p-6">
            <div>
              <label className="mb-1 block text-xs font-medium">Into account</label>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
            {(["date", "amount", "description", "merchant"] as const).map((key) => (
              <div key={key}>
                <label className="mb-1 block text-xs font-medium capitalize">{key} column</label>
                <select
                  value={cols[key]}
                  onChange={(e) => setCol(key, Number(e.target.value))}
                  className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
                >
                  <option value={-1}>—</option>
                  {colOptions.map((i) => (
                    <option key={i} value={i}>
                      {header?.[i]?.trim()
                        ? header[i].trim().replace(/\b\w/g, (ch) => ch.toUpperCase())
                        : `col ${i + 1}`}
                      {body[0]?.[i] ? ` — e.g. "${String(body[0][i]).slice(0, 16)}"` : ""}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
            <div className="border-b border-stone-100 px-4 py-2 text-xs font-medium text-stone-400">
              Preview (first 8)
            </div>
            <table className="w-full text-sm">
              <tbody>
                {parsed.slice(0, 8).map((r, i) => (
                  <tr key={i} className={`border-b border-stone-100 ${i % 2 ? "bg-stone-50" : ""}`}>
                    <td className="whitespace-nowrap px-4 py-2 text-stone-500">{r.date}</td>
                    <td className="max-w-80 truncate px-4 py-2">{r.merchant ?? r.description}</td>
                    <td className={`whitespace-nowrap px-4 py-2 text-right font-medium ${r.amount < 0 ? "text-stone-800" : "text-emerald-600"}`}>
                      {r.amount.toFixed(2)}
                    </td>
                  </tr>
                ))}
                {parsed.length === 0 && (
                  <tr><td className="px-4 py-6 text-center text-stone-400">Nothing parseable — check the column mapping above.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-3">
            <button
              disabled={pending || parsed.length === 0 || !accountId}
              onClick={() =>
                startTransition(async () => {
                  const res = await importTransactions(accountId, parsed);
                  setResult(
                    res.ok
                      ? `Imported ${res.inserted} transaction${res.inserted === 1 ? "" : "s"}${res.skipped ? `, skipped ${res.skipped} duplicate${res.skipped === 1 ? "" : "s"}` : ""}.`
                      : (res.error ?? "Import failed")
                  );
                })
              }
              className="rounded-lg bg-stone-900 px-5 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-40"
            >
              {pending ? "Importing…" : `Import ${parsed.length} transactions`}
            </button>
            {result && <span className="text-sm text-stone-600">{result}</span>}
            {result?.startsWith("Imported") && (
              <Link href="/finance/transactions" className="text-sm underline">View transactions →</Link>
            )}
          </div>
        </>
      )}
    </div>
  );
}
