"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { GroceryCat, Retailer } from "@/lib/grocery-data";
import {
  createGroceryCategoryInline,
  renameGroceryCategoryInline,
  deleteGroceryCategoryInline,
  createRetailerInline,
  renameRetailerInline,
  deleteRetailerInline,
} from "@/lib/actions/grocery-admin";
import { ConfirmDialog } from "@/components/confirm-dialog";

/** Manage the category tree (one sub-level) and the household's retailers. */

export function GroceryAdmin({
  categories,
  retailers,
}: {
  categories: GroceryCat[];
  retailers: Retailer[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [newTop, setNewTop] = useState("");
  const [newSub, setNewSub] = useState<{ parentId: string; name: string } | null>(null);
  const [newRetailer, setNewRetailer] = useState("");
  const [pendingDelete, setPendingDelete] = useState<
    { kind: "cat" | "ret"; id: string; name: string } | null
  >(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const tops = categories.filter((c) => !c.parent_id);
  const kidsOf = (id: string) => categories.filter((c) => c.parent_id === id);

  async function run(p: Promise<{ ok: boolean; error?: string }>) {
    const res = await p;
    if (!res.ok) setError(res.error ?? "Something went wrong");
    else {
      setError(null);
      router.refresh();
    }
  }

  const nameInput =
    "rounded-lg border border-stone-300 px-2 py-1 text-sm focus:border-teal-500 focus:outline-none";

  const Row = ({ cat, sub }: { cat: GroceryCat; sub?: boolean }) => (
    <div className={`flex items-center gap-2 py-1 ${sub ? "pl-6" : ""}`}>
      {!sub && <span className="w-5 text-center">{cat.emoji ?? "·"}</span>}
      {sub && <span className="text-stone-300">↳</span>}
      <input
        defaultValue={cat.name}
        onBlur={(e) => {
          const v = e.target.value.trim();
          if (v && v !== cat.name) run(renameGroceryCategoryInline(cat.id, v));
        }}
        className={`${nameInput} flex-1 border-transparent bg-transparent hover:border-stone-200`}
      />
      {!sub && (
        <button
          type="button"
          onClick={() => setNewSub({ parentId: cat.id, name: "" })}
          className="rounded px-1.5 text-xs text-stone-300 hover:bg-stone-100 hover:text-stone-500"
          title="Add sub-category"
        >
          + sub
        </button>
      )}
      <button
        type="button"
        onClick={() => setPendingDelete({ kind: "cat", id: cat.id, name: cat.name })}
        className="text-xs text-stone-300 hover:text-red-600"
        title="Delete"
      >
        ✕
      </button>
    </div>
  );

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-xl border border-stone-200 bg-white p-4">
        <h3 className="text-sm font-semibold">Categories</h3>
        <p className="mt-0.5 text-xs text-stone-400">
          Rename anything, add your own, nest one level of sub-categories (Meat → Beef).
        </p>
        <div className="mt-2 divide-y divide-stone-50">
          {tops.map((t) => (
            <div key={t.id}>
              <Row cat={t} />
              {kidsOf(t.id).map((k) => (
                <Row key={k.id} cat={k} sub />
              ))}
              {newSub?.parentId === t.id && (
                <div className="flex items-center gap-2 py-1 pl-6">
                  <span className="text-stone-300">↳</span>
                  <input
                    autoFocus
                    value={newSub.name}
                    onChange={(e) => setNewSub({ parentId: t.id, name: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newSub.name.trim()) {
                        run(createGroceryCategoryInline(newSub.name, t.id));
                        setNewSub(null);
                      }
                      if (e.key === "Escape") setNewSub(null);
                    }}
                    onBlur={() => {
                      if (newSub.name.trim()) run(createGroceryCategoryInline(newSub.name, t.id));
                      setNewSub(null);
                    }}
                    placeholder="Sub-category name…"
                    className={`${nameInput} flex-1`}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <input
            value={newTop}
            onChange={(e) => setNewTop(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newTop.trim()) {
                run(createGroceryCategoryInline(newTop, null));
                setNewTop("");
              }
            }}
            placeholder="New category…"
            className={`${nameInput} flex-1`}
          />
          <button
            type="button"
            onClick={() => {
              if (newTop.trim()) {
                run(createGroceryCategoryInline(newTop, null));
                setNewTop("");
              }
            }}
            className="rounded-lg border border-stone-300 px-3 py-1 text-sm hover:bg-stone-100"
          >
            Add
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-stone-200 bg-white p-4">
        <h3 className="text-sm font-semibold">Retailers</h3>
        <p className="mt-0.5 text-xs text-stone-400">
          Where you shop — Woolies, Aldi, the butcher… Items can prefer a retailer, and
          shopping lists split per retailer when you plan the shop.
        </p>
        <div className="mt-2 divide-y divide-stone-50">
          {retailers.map((r) => (
            <div key={r.id} className="flex items-center gap-2 py-1">
              <span className="w-5 text-center">🏪</span>
              <input
                defaultValue={r.name}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== r.name) run(renameRetailerInline(r.id, v));
                }}
                className={`${nameInput} flex-1 border-transparent bg-transparent hover:border-stone-200`}
              />
              <button
                type="button"
                onClick={() => setPendingDelete({ kind: "ret", id: r.id, name: r.name })}
                className="text-xs text-stone-300 hover:text-red-600"
                title="Delete"
              >
                ✕
              </button>
            </div>
          ))}
          {retailers.length === 0 && (
            <p className="py-2 text-xs text-stone-400">None yet.</p>
          )}
        </div>
        <div className="mt-2 flex gap-2">
          <input
            value={newRetailer}
            onChange={(e) => setNewRetailer(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newRetailer.trim()) {
                run(createRetailerInline(newRetailer));
                setNewRetailer("");
              }
            }}
            placeholder="New retailer…"
            className={`${nameInput} flex-1`}
          />
          <button
            type="button"
            onClick={() => {
              if (newRetailer.trim()) {
                run(createRetailerInline(newRetailer));
                setNewRetailer("");
              }
            }}
            className="rounded-lg border border-stone-300 px-3 py-1 text-sm hover:bg-stone-100"
          >
            Add
          </button>
        </div>
      </div>
      {error && <p className="text-xs text-red-600 md:col-span-2">{error}</p>}
      <ConfirmDialog
        open={pendingDelete !== null}
        busy={deleteBusy}
        title={pendingDelete?.kind === "cat" ? "Delete this category?" : "Remove this retailer?"}
        message={
          pendingDelete?.kind === "cat"
            ? `"${pendingDelete.name}" (and its sub-categories) will be removed. Items keep their name and fall back to Uncategorised.`
            : `"${pendingDelete?.name}" will be removed. Items preferring it fall back to "anywhere".`
        }
        confirmLabel={pendingDelete?.kind === "cat" ? "Delete category" : "Remove retailer"}
        onCancel={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (!pendingDelete) return;
          setDeleteBusy(true);
          await run(
            pendingDelete.kind === "cat"
              ? deleteGroceryCategoryInline(pendingDelete.id)
              : deleteRetailerInline(pendingDelete.id)
          );
          setDeleteBusy(false);
          setPendingDelete(null);
        }}
      />
    </div>
  );
}
