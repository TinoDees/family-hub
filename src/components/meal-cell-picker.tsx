"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  addMealEntriesInline,
  removeMealEntryInline,
  setMealEntryServingsInline,
  type AddedMealEntry,
} from "@/lib/actions/meals";
import { quickCreateRecipeInline } from "@/lib/actions/recipes";

/**
 * One planner cell: entry chips + the combobox ("+ add").
 *
 * The ladder in action: type → matching recipes appear (multi-select: the
 * popover stays open, keep picking); no match → create the recipe on the fly
 * in the quick-add modal (name only required, ingredients as a brain-dump);
 * or keep it as one-off text (Leftovers etc.) that deliberately stays out of
 * the recipe book. All mutations optimistic with rollback.
 */

export type CellEntry = {
  id: string;
  recipe_id: string | null;
  custom_text: string | null;
  servings: number | null;
  recipe_name: string | null;
};
export type RecipeOption = { id: string; name: string };

const ONE_OFFS = ["Leftovers", "Takeaway", "Eating out", "At friends'"];

export function MealCellPicker({
  date,
  slot,
  initialEntries,
  recipes,
  canEdit,
}: {
  date: string;
  slot: string;
  initialEntries: CellEntry[];
  recipes: RecipeOption[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [entries, setEntries] = useState<CellEntry[]>(initialEntries);
  const [localRecipes, setLocalRecipes] = useState<RecipeOption[]>(recipes);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<{ name: string; ingredients: string; method: string } | null>(null);
  const [servingsEdit, setServingsEdit] = useState<{ id: string; value: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const tmpSeq = useRef(0);

  const initialKey = JSON.stringify(initialEntries);
  useEffect(() => {
    setEntries(initialEntries);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialKey]);
  useEffect(() => setLocalRecipes(recipes), [recipes]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const q = query.trim();
  const matches = useMemo(() => {
    if (!q) return localRecipes.slice(0, 6);
    const lower = q.toLowerCase();
    return localRecipes
      .filter((r) => r.name.toLowerCase().includes(lower))
      .sort((a, b) => {
        const ax = a.name.toLowerCase() === lower ? 0 : a.name.toLowerCase().startsWith(lower) ? 1 : 2;
        const bx = b.name.toLowerCase() === lower ? 0 : b.name.toLowerCase().startsWith(lower) ? 1 : 2;
        return ax - bx || a.name.localeCompare(b.name);
      })
      .slice(0, 8);
  }, [q, localRecipes]);
  const exactMatch = localRecipes.find((r) => r.name.toLowerCase() === q.toLowerCase());

  async function addEntry(item: { recipeId?: string; customText?: string; recipeName?: string }) {
    setError(null);
    setBusy(true);
    const tmpId = `tmp-${++tmpSeq.current}`;
    const optimistic: CellEntry = {
      id: tmpId,
      recipe_id: item.recipeId ?? null,
      custom_text: item.customText ?? null,
      servings: null,
      recipe_name: item.recipeName ?? null,
    };
    setEntries((e) => [...e, optimistic]);
    setQuery("");
    inputRef.current?.focus();

    const res = await addMealEntriesInline(date, slot, [
      { recipeId: item.recipeId ?? null, customText: item.customText ?? null },
    ]);
    setBusy(false);
    if (!res.ok || !res.entries?.length) {
      setEntries((e) => e.filter((x) => x.id !== tmpId)); // rollback
      setError(res.error ?? "Could not add");
      return;
    }
    const saved: AddedMealEntry = res.entries[0];
    setEntries((e) => e.map((x) => (x.id === tmpId ? { ...saved } : x)));
    router.refresh();
  }

  async function removeEntry(id: string) {
    if (id.startsWith("tmp-")) return;
    setError(null);
    const prev = entries;
    setEntries((e) => e.filter((x) => x.id !== id));
    const res = await removeMealEntryInline(id);
    if (!res.ok) {
      setEntries(prev); // rollback
      setError(res.error ?? "Could not remove");
      return;
    }
    router.refresh();
  }

  async function commitServings(id: string, raw: string) {
    setServingsEdit(null);
    const n = parseInt(raw);
    const value = raw.trim() === "" || isNaN(n) ? null : Math.min(50, Math.max(1, n));
    const prev = entries;
    setEntries((e) => e.map((x) => (x.id === id ? { ...x, servings: value } : x)));
    const res = await setMealEntryServingsInline(id, value);
    if (!res.ok) {
      setEntries(prev);
      setError(res.error ?? "Could not save servings");
      return;
    }
    router.refresh();
  }

  async function saveQuickRecipe() {
    if (!modal) return;
    const name = modal.name.trim();
    if (!name) {
      setError("The meal needs a name");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await quickCreateRecipeInline(name, modal.ingredients, modal.method);
    setBusy(false);
    if (!res.ok || !res.recipe) {
      setError(res.error ?? "Could not save the recipe");
      return;
    }
    if (!res.existing) setLocalRecipes((r) => [...r, res.recipe!].sort((a, b) => a.name.localeCompare(b.name)));
    setModal(null);
    await addEntry({ recipeId: res.recipe.id, recipeName: res.recipe.name });
  }

  const rowCls =
    "flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs hover:bg-stone-100";

  return (
    <div className="space-y-1">
      {entries.map((e) => (
        <div
          key={e.id}
          className={`group flex items-start justify-between gap-1 rounded-lg px-2 py-1 text-xs ${
            e.recipe_id ? "bg-teal-50 text-teal-900" : "bg-stone-100 italic text-stone-500"
          } ${e.id.startsWith("tmp-") ? "opacity-50" : ""}`}
        >
          {e.recipe_id ? (
            <span className="min-w-0">
              <Link href={`/recipes/${e.recipe_id}`} className="hover:underline">
                {e.recipe_name ?? "Recipe"}
              </Link>
              {canEdit && servingsEdit?.id === e.id ? (
                <input
                  autoFocus
                  value={servingsEdit.value}
                  onChange={(ev) => setServingsEdit({ id: e.id, value: ev.target.value })}
                  onBlur={() => commitServings(e.id, servingsEdit.value)}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter") commitServings(e.id, servingsEdit.value);
                    if (ev.key === "Escape") setServingsEdit(null);
                  }}
                  inputMode="numeric"
                  className="ml-1 w-8 rounded border border-teal-300 bg-white px-0.5 text-center"
                  placeholder="4"
                />
              ) : (
                <button
                  type="button"
                  disabled={!canEdit || e.id.startsWith("tmp-")}
                  onClick={() => setServingsEdit({ id: e.id, value: e.servings ? String(e.servings) : "" })}
                  className={`ml-1 rounded text-teal-600/70 ${canEdit ? "hover:bg-teal-100 hover:text-teal-800" : ""}`}
                  title="Planned servings"
                >
                  ×{e.servings ?? "?"}
                </button>
              )}
            </span>
          ) : (
            <span className="min-w-0 break-words">{e.custom_text}</span>
          )}
          {canEdit && !e.id.startsWith("tmp-") && (
            <button
              type="button"
              onClick={() => removeEntry(e.id)}
              className="text-stone-300 hover:text-red-600"
              title="Remove"
            >
              ✕
            </button>
          )}
        </div>
      ))}

      {canEdit && (
        <div className="relative" ref={boxRef}>
          {!open ? (
            <button
              type="button"
              onClick={() => {
                setOpen(true);
                setError(null);
                setTimeout(() => inputRef.current?.focus(), 0);
              }}
              className="rounded px-1 text-xs text-stone-300 hover:text-stone-500"
            >
              + add
            </button>
          ) : (
            <div className="absolute left-0 top-0 z-20 w-56 rounded-xl border border-stone-200 bg-white p-1.5 shadow-lg">
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setOpen(false);
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (matches.length > 0) {
                      addEntry({ recipeId: matches[0].id, recipeName: matches[0].name });
                    } else if (q) {
                      setModal({ name: q, ingredients: "", method: "" });
                    }
                  }
                }}
                placeholder="Type a meal…"
                className="mb-1 w-full rounded-lg border border-stone-300 px-2 py-1.5 text-xs focus:border-teal-500 focus:outline-none"
              />
              <div className="max-h-56 overflow-y-auto">
                {matches.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    disabled={busy}
                    onClick={() => addEntry({ recipeId: r.id, recipeName: r.name })}
                    className={rowCls}
                  >
                    <span aria-hidden>🍽️</span>
                    <span className="truncate">{r.name}</span>
                  </button>
                ))}
                {q && !exactMatch && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setModal({ name: q, ingredients: "", method: "" })}
                    className={`${rowCls} font-medium text-teal-700`}
                  >
                    <span aria-hidden>＋</span>
                    <span className="truncate">Create &ldquo;{q}&rdquo;</span>
                  </button>
                )}
                {q && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => addEntry({ customText: q })}
                    className={`${rowCls} text-stone-500`}
                  >
                    <span aria-hidden>💬</span>
                    <span className="truncate">Use &ldquo;{q}&rdquo; as one-off text</span>
                  </button>
                )}
                {!q && (
                  <>
                    <div className="px-2 pb-0.5 pt-1 text-[10px] font-medium uppercase tracking-wide text-stone-400">
                      One-offs
                    </div>
                    {ONE_OFFS.map((t) => (
                      <button key={t} type="button" disabled={busy} onClick={() => addEntry({ customText: t })} className={`${rowCls} text-stone-500`}>
                        <span aria-hidden>💬</span>
                        {t}
                      </button>
                    ))}
                  </>
                )}
              </div>
              {error && <p className="px-2 py-1 text-[11px] text-red-600">{error}</p>}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="mt-0.5 w-full rounded px-2 py-1 text-[11px] text-stone-400 hover:bg-stone-50"
              >
                Done
              </button>
            </div>
          )}
        </div>
      )}
      {!open && error && <p className="text-[11px] text-red-600">{error}</p>}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => !busy && setModal(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold">New recipe — quick add</h3>
            <p className="mt-0.5 text-xs text-stone-400">
              Only the name is needed. Add ingredients from your head if you like — everything can be finished later.
            </p>
            <label className="mt-3 block text-xs font-medium text-stone-500">Name</label>
            <input
              value={modal.name}
              onChange={(e) => setModal({ ...modal, name: e.target.value })}
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
              autoFocus
            />
            <label className="mt-3 block text-xs font-medium text-stone-500">
              Ingredients <span className="font-normal text-stone-400">(optional — one per line, e.g. “500g beef mince”)</span>
            </label>
            <textarea
              value={modal.ingredients}
              onChange={(e) => setModal({ ...modal, ingredients: e.target.value })}
              rows={5}
              placeholder={"500g beef mince\n1 onion\ngherkins\nmustard"}
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
            />
            <details className="mt-3">
              <summary className="cursor-pointer text-xs font-medium text-stone-500">Method (optional)</summary>
              <textarea
                value={modal.method}
                onChange={(e) => setModal({ ...modal, method: e.target.value })}
                rows={4}
                placeholder="Steps — or leave for another day."
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
              />
            </details>
            {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setModal(null)}
                className="rounded-lg border border-stone-300 px-4 py-1.5 text-sm hover:bg-stone-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={saveQuickRecipe}
                className="rounded-lg bg-teal-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-teal-600 disabled:opacity-50"
              >
                {busy ? "Saving…" : "Save & plan it"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
