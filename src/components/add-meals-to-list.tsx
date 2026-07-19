"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addMealIngredientsToListInline } from "@/lib/actions/shopping";

/** Pull planned-meal ingredients for a date range onto this list. */
export function AddMealsToList({
  listId,
  defaultFrom,
  defaultTo,
}: {
  listId: string;
  defaultFrom: string;
  defaultTo: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    const res = await addMealIngredientsToListInline(listId, from, to);
    setBusy(false);
    if (!res.ok) {
      setMsg(res.error ?? "Could not add ingredients");
      return;
    }
    setMsg(
      `Added ${res.added} ingredient${res.added === 1 ? "" : "s"}${
        res.skipped ? ` (${res.skipped} already on the list)` : ""
      }.`
    );
    router.refresh();
  }

  const dateInput =
    "rounded-lg border border-stone-300 bg-white px-2 py-1 text-xs focus:border-teal-500 focus:outline-none";

  return (
    <div className="inline-flex flex-col items-end gap-1.5">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium hover:bg-stone-100"
        >
          🍽️ Add meal ingredients
        </button>
      ) : (
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <input type="date" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} className={dateInput} title="Meals from" />
          <span className="text-xs text-stone-400">→</span>
          <input type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} className={dateInput} title="Meals to" />
          <button
            type="button"
            onClick={run}
            disabled={busy}
            className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-stone-700 disabled:opacity-50"
          >
            {busy ? "Adding…" : "🍽️ Add"}
          </button>
        </div>
      )}
      {msg && <p className="text-xs text-stone-500">{msg}</p>}
    </div>
  );
}
