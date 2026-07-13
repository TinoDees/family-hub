"use client";

import { useState } from "react";

export type FamilyDetailRow = {
  member: string;
  expense: string;
  item: string; // line item description or "share of shared costs"
  amount: number;
};

function money(n: number, currency: string) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency, currencyDisplay: "narrowSymbol" }).format(n);
}

export function FamilySpendModal({
  familyName,
  paid,
  share,
  rows,
  currency,
}: {
  familyName: string;
  paid: number;
  share: number;
  rows: FamilyDetailRow[];
  currency: string;
}) {
  const [open, setOpen] = useState(false);
  const net = Math.round((paid - share) * 100) / 100;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full text-left hover:bg-stone-50"
      >
        <div className="flex items-center justify-between px-4 py-2.5 text-sm">
          <span className="font-medium underline decoration-stone-300 underline-offset-2">{familyName}</span>
          <span className="flex items-center gap-4">
            <span className="text-stone-500">paid {money(paid, currency)}</span>
            <span className="text-stone-500">share {money(share, currency)}</span>
            <span className={`w-24 text-right font-medium ${net > 0.004 ? "text-emerald-600" : net < -0.004 ? "text-red-600" : "text-stone-400"}`}>
              {net > 0.004 ? "+" : ""}{money(net, currency)}
            </span>
          </span>
        </div>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6">
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-5 sm:rounded-2xl">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold">{familyName}</h2>
                <p className="text-sm text-stone-500">
                  Paid {money(paid, currency)} · consumed {money(share, currency)} ·{" "}
                  {net > 0.004 ? `is owed ${money(net, currency)}` : net < -0.004 ? `owes ${money(-net, currency)}` : "settled"}
                </p>
              </div>
              <button onClick={() => setOpen(false)} className="rounded-lg p-2 text-stone-400 hover:bg-stone-100">✕</button>
            </div>
            <table className="mt-4 w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-left text-xs text-stone-400">
                  <th className="py-1.5 font-medium">Member</th>
                  <th className="py-1.5 font-medium">Expense</th>
                  <th className="py-1.5 font-medium">Item</th>
                  <th className="py-1.5 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={4} className="py-6 text-center text-stone-400">Nothing consumed yet.</td></tr>
                ) : (
                  rows.map((r, i) => (
                    <tr key={i} className={`border-b border-stone-100 ${i % 2 ? "bg-stone-50" : ""}`}>
                      <td className="py-1.5 pr-2">{r.member}</td>
                      <td className="max-w-40 truncate py-1.5 pr-2 text-stone-500">{r.expense}</td>
                      <td className="max-w-48 truncate py-1.5 pr-2">{r.item}</td>
                      <td className="whitespace-nowrap py-1.5 text-right font-medium">{money(r.amount, currency)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
