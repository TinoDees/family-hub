"use client";

import { useMemo, useState, useTransition } from "react";
import { saveExpenseSplit, resetEqualSplit } from "@/lib/actions/split";

type Participant = { id: string; name: string };
type Item = { id: string; description: string; amount: number; consumed_by: string | null };

function money(n: number, currency: string) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency, currencyDisplay: "narrowSymbol" }).format(n);
}

export function ExpenseSplitModal({
  expense,
  items,
  participants,
  currentShareIds,
  currency,
}: {
  expense: { id: string; description: string; amount: number };
  items: Item[];
  participants: Participant[];
  currentShareIds: string[];
  currency: string;
}) {
  const [open, setOpen] = useState(false);
  const [alloc, setAlloc] = useState<Record<string, string>>(
    Object.fromEntries(items.map((i) => [i.id, i.consumed_by ?? ""]))
  );
  const [shared, setShared] = useState<Set<string>>(
    new Set(currentShareIds.length > 0 ? currentShareIds : participants.map((p) => p.id))
  );
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const preview = useMemo(() => {
    const per = new Map<string, number>();
    let allocated = 0;
    for (const i of items) {
      const pid = alloc[i.id] ?? "";
      if (pid) {
        per.set(pid, (per.get(pid) ?? 0) + Number(i.amount));
        allocated += Number(i.amount);
      }
    }
    const pool = Math.round((Number(expense.amount) - allocated) * 100) / 100;
    const sharedList = [...shared];
    if (pool > 0 && sharedList.length > 0) {
      const each = pool / sharedList.length;
      for (const pid of sharedList) per.set(pid, (per.get(pid) ?? 0) + each);
    }
    return { per, pool, over: pool < -0.004 };
  }, [alloc, shared, items, expense.amount]);

  const toggleShared = (pid: string) =>
    setShared((s) => {
      const n = new Set(s);
      if (n.has(pid)) n.delete(pid);
      else n.add(pid);
      return n;
    });

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-stone-300 px-2.5 py-1 text-xs font-medium hover:bg-stone-100"
      >
        Split
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6">
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-5 sm:rounded-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{expense.description}</h2>
                <p className="text-sm text-stone-500">
                  {money(Number(expense.amount), currency)} — allocate line items, the rest splits equally.
                </p>
              </div>
              <button onClick={() => setOpen(false)} className="rounded-lg p-2 text-stone-400 hover:bg-stone-100">✕</button>
            </div>

            {items.length === 0 ? (
              <p className="mt-4 rounded-lg bg-stone-50 px-3 py-4 text-center text-sm text-stone-400">
                No line items on this expense — scan the receipt when adding to get them.
                You can still choose who shares it equally below.
              </p>
            ) : (
              <div className="mt-4 space-y-1.5">
                {items.map((i) => (
                  <div key={i.id} className="flex items-center gap-2 rounded-lg border border-stone-100 px-3 py-1.5">
                    <span className="flex-1 truncate text-sm">{i.description}</span>
                    <span className="w-20 text-right text-sm font-medium">{money(Number(i.amount), currency)}</span>
                    <select
                      value={alloc[i.id] ?? ""}
                      onChange={(e) => setAlloc((a) => ({ ...a, [i.id]: e.target.value }))}
                      className={`w-40 rounded-lg border px-2 py-1 text-xs ${alloc[i.id] ? "border-emerald-300 bg-emerald-50" : "border-stone-200 bg-white"}`}
                    >
                      <option value="">— shared —</option>
                      {participants.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4">
              <div className="mb-1 text-xs font-medium text-stone-500">
                Shared part ({money(Math.max(0, preview.pool), currency)} — includes tip/rounding) split between:
              </div>
              <div className="flex flex-wrap gap-3">
                {participants.map((p) => (
                  <label key={p.id} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={shared.has(p.id)}
                      onChange={() => toggleShared(p.id)}
                      className="rounded border-stone-300"
                    />
                    {p.name}
                  </label>
                ))}
              </div>
            </div>

            <div className="mt-4 rounded-xl bg-stone-50 p-4">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400">Result</div>
              {preview.over ? (
                <p className="text-sm text-red-600">Allocated items exceed the bill total — check the amounts.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {participants
                    .filter((p) => (preview.per.get(p.id) ?? 0) > 0.004)
                    .map((p) => (
                      <li key={p.id} className="flex justify-between">
                        <span>{p.name}</span>
                        <span className="font-medium">{money(preview.per.get(p.id) ?? 0, currency)}</span>
                      </li>
                    ))}
                </ul>
              )}
            </div>

            {msg && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{msg}</p>}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                disabled={pending || preview.over}
                onClick={() =>
                  startTransition(async () => {
                    const res = await saveExpenseSplit(expense.id, alloc, [...shared]);
                    if (!res.ok) setMsg(res.error ?? "Could not save");
                    else {
                      setMsg(null);
                      setOpen(false);
                    }
                  })
                }
                className="rounded-lg bg-stone-900 px-5 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-40"
              >
                {pending ? "Saving…" : "Save split"}
              </button>
              <button
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const res = await resetEqualSplit(expense.id, [...shared]);
                    if (!res.ok) setMsg(res.error ?? "Could not save");
                    else {
                      setMsg(null);
                      setOpen(false);
                    }
                  })
                }
                className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium hover:bg-stone-100 disabled:opacity-40"
              >
                Split equally instead
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
