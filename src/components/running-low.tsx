"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createNoteInline,
  deleteNoteInline,
  type ShoppingNote,
} from "@/lib/actions/notes";

/**
 * "Running low? Jot it down." — the two-second capture that replaces the
 * paper note on the fridge. Notes collect during the week and flow into the
 * shopping Plan automatically (cleared once they land on a created list).
 */

export function RunningLow({
  initial,
  canEdit,
}: {
  initial: ShoppingNote[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [notes, setNotes] = useState<ShoppingNote[]>(initial);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    const clean = name.trim();
    if (!clean || busy) return;
    setBusy(true);
    setError(null);
    const res = await createNoteInline(clean);
    setBusy(false);
    if (!res.ok || !res.note) {
      setError(res.error ?? "Could not save");
      return;
    }
    setNotes((n) => [...n, res.note!]);
    setName("");
    router.refresh();
  }

  async function remove(id: string) {
    const prev = notes;
    setNotes((n) => n.filter((x) => x.id !== id));
    const res = await deleteNoteInline(id);
    if (!res.ok) {
      setNotes(prev);
      setError(res.error ?? "Could not remove");
    } else {
      router.refresh();
    }
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">📝 Running low on something?</span>
        {canEdit && (
          <>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              placeholder="milk, bin bags…"
              className="w-44 rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-sm focus:border-amber-400 focus:outline-none"
            />
            <button
              type="button"
              onClick={add}
              disabled={busy || !name.trim()}
              className="rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-400 disabled:opacity-40"
            >
              Jot it down
            </button>
          </>
        )}
        <span className="text-xs text-stone-400">
          — it&apos;ll be waiting in the next shop&apos;s plan.
        </span>
      </div>
      {notes.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {notes.map((n) => (
            <span
              key={n.id}
              className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-white px-2.5 py-1 text-xs"
            >
              {n.name}
              {n.qty && <span className="text-stone-400">{n.qty}</span>}
              {canEdit && (
                <button
                  type="button"
                  onClick={() => remove(n.id)}
                  className="text-stone-300 hover:text-red-600"
                  title="Remove"
                >
                  ✕
                </button>
              )}
            </span>
          ))}
        </div>
      )}
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
    </div>
  );
}
