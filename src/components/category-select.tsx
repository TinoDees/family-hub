"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { NewCategoryModal, type NewCat } from "@/components/category-modal";

type Cat = { id: string; name: string; icon: string | null; kind: string };

/**
 * THE category picker for modals and forms — the single shared combobox:
 * search box, filtered list, and "＋ New category…" at the bottom (opens the
 * shared NewCategoryModal). Use this everywhere a category is chosen outside
 * a grid cell; restyle it here and the whole app follows.
 */
export function CategorySelect({
  categories,
  value,
  onPick,
  onCategoryCreated,
  placeholder = "— pick a category —",
}: {
  categories: Cat[];
  /** Selected category id, or "" for none. */
  value: string;
  onPick: (categoryId: string) => void;
  /** Called when a category is created inline, so the caller can add it to its list. */
  onCategoryCreated?: (c: NewCat) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [showNew, setShowNew] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const current = useMemo(() => categories.find((c) => c.id === value) ?? null, [categories, value]);
  const needle = q.trim().toLowerCase();
  const shown = needle
    ? categories.filter((c) => c.name.toLowerCase().includes(needle))
    : categories;

  const pick = (id: string) => {
    onPick(id);
    setOpen(false);
    setQ("");
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-stone-300 bg-white px-3 py-2 text-left text-sm hover:bg-stone-50"
      >
        <span className={`truncate ${current ? "" : "text-stone-400"}`}>
          {current ? `${current.icon ?? "🏷️"} ${current.name}` : placeholder}
        </span>
        <span className="text-[10px] text-stone-400">▾</span>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-40 mt-1 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-lg">
          <div className="border-b border-stone-100 p-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="🔍 Type to search…"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (shown.length === 1) pick(shown[0].id);
                }
                if (e.key === "Escape") setOpen(false);
              }}
              className="w-full rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs outline-none focus:border-stone-500"
            />
          </div>
          <div className="max-h-52 overflow-y-auto py-1">
            {shown.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => pick(c.id)}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-stone-50 ${
                  c.id === value ? "bg-stone-50 font-medium" : ""
                }`}
              >
                <span>{c.icon ?? "🏷️"}</span>
                <span className="truncate">{c.name}</span>
                <span className="ml-auto text-[10px] uppercase text-stone-300">{c.kind}</span>
              </button>
            ))}
            {shown.length === 0 && (
              <p className="px-3 py-2 text-xs text-stone-400">No matches.</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setShowNew(true);
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 border-t border-stone-100 bg-teal-50 px-3 py-2 text-left text-xs font-medium text-teal-700 hover:bg-teal-100"
          >
            ＋ New category{needle ? ` “${q.trim()}”` : "…"}
          </button>
        </div>
      )}

      {showNew && (
        <NewCategoryModal
          initialName={q.trim()}
          onClose={() => setShowNew(false)}
          onCreated={(c) => {
            onCategoryCreated?.(c);
            onPick(c.id);
            setShowNew(false);
            setQ("");
          }}
        />
      )}
    </div>
  );
}
