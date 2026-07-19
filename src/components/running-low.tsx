"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createNoteInline,
  deleteNoteInline,
  type ShoppingNote,
} from "@/lib/actions/notes";

/**
 * "Running low? Jot it down." — two-second capture with autocomplete against
 * the pantry catalog (matches anywhere in the name), so "toi…" resolves to
 * the canonical "Toilet Paper" instead of a misspelt duplicate.
 */

export function RunningLow({
  initial,
  suggestions,
  canEdit,
}: {
  initial: ShoppingNote[];
  suggestions: string[]; // pantry item names — the canonical vocabulary
  canEdit: boolean;
}) {
  const router = useRouter();
  const [notes, setNotes] = useState<ShoppingNote[]>(initial);
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const q = name.trim().toLowerCase();
  const noteNames = useMemo(() => new Set(notes.map((n) => n.name.toLowerCase())), [notes]);
  const matches = useMemo(() => {
    if (!q) return [];
    return suggestions
      .filter((s) => s.toLowerCase().includes(q))
      .sort((a, b) => {
        const ax = a.toLowerCase().startsWith(q) ? 0 : 1;
        const bx = b.toLowerCase().startsWith(q) ? 0 : 1;
        return ax - bx || a.localeCompare(b);
      })
      .slice(0, 6);
  }, [q, suggestions]);
  const alreadyNoted = q !== "" && noteNames.has(q);
  const exactMatch = matches.find((m) => m.toLowerCase() === q);

  async function add(text: string) {
    const clean = text.trim();
    if (!clean || busy) return;
    if (noteNames.has(clean.toLowerCase())) {
      setError(`"${clean}" is already jotted down`);
      setOpen(false);
      return;
    }
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
    setOpen(false);
    inputRef.current?.focus();
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
            <div className="relative">
              <input
                ref={inputRef}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setOpen(true);
                  setError(null);
                }}
                onFocus={() => setOpen(true)}
                onBlur={() => setTimeout(() => setOpen(false), 150)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setOpen(false);
                  if (e.key === "Enter") {
                    e.preventDefault();
                    add(exactMatch ?? matches[0] ?? name);
                  }
                }}
                placeholder="milk, bin bags…"
                className="w-44 rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-sm focus:border-amber-400 focus:outline-none"
              />
              {open && q && (matches.length > 0 || !exactMatch) && (
                <div className="absolute left-0 top-full z-30 mt-1 w-56 rounded-xl border border-stone-200 bg-white p-1 shadow-lg">
                  {matches.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        add(m);
                      }}
                      disabled={busy || noteNames.has(m.toLowerCase())}
                      className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs hover:bg-stone-100 disabled:opacity-40"
                    >
                      <span aria-hidden>🧺</span>
                      <span className="truncate">{m}</span>
                      {noteNames.has(m.toLowerCase()) && (
                        <span className="ml-auto text-[10px] text-stone-400">noted ✓</span>
                      )}
                    </button>
                  ))}
                  {!exactMatch && (
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        add(name);
                      }}
                      disabled={busy || alreadyNoted}
                      className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-40"
                    >
                      <span aria-hidden>＋</span>
                      <span className="truncate">Jot down &ldquo;{name.trim()}&rdquo;</span>
                    </button>
                  )}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => add(exactMatch ?? name)}
              disabled={busy || !name.trim() || alreadyNoted}
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
