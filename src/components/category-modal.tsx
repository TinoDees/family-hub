"use client";

import { useState } from "react";
import { createCategoryInline } from "@/lib/actions/finance";
import { EmojiPicker } from "@/components/emoji-picker";

/**
 * THE new-category modal — the single shared design (emoji library picker,
 * name, kind). Every "add a category" flow in the app opens THIS component:
 * the categories sheet, the transactions grid's type-ahead, the rule book,
 * anywhere new. Restyle it here and the whole app follows — never fork it.
 */

export type NewCat = {
  id: string;
  name: string;
  icon: string | null;
  kind: string;
  parent_id: string | null;
};

export function NewCategoryModal({
  initialName = "",
  onClose,
  onCreated,
}: {
  initialName?: string;
  onClose: () => void;
  onCreated: (c: NewCat) => void;
}) {
  const [name, setName] = useState(initialName);
  const [icon, setIcon] = useState("");
  const [kind, setKind] = useState("expense");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    const res = await createCategoryInline(name, icon, kind);
    setBusy(false);
    if (!res.ok || !res.category) {
      setError(res.error ?? "Could not create category");
      return;
    }
    onCreated(res.category as NewCat);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-2xl border border-stone-200 bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold">＋ New category</h2>
        {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              placeholder="e.g. Pets"
              onKeyDown={(e) => { if (e.key === "Enter" && name.trim() && !busy) save(); }}
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-stone-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">
              Emoji {icon && <span className="ml-1 text-base">{icon}</span>}
            </label>
            <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-2.5">
              <EmojiPicker current={icon || null} onPick={setIcon} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Kind</label>
            <div className="flex gap-2">
              {(["expense", "income"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={`rounded-lg border px-3 py-1.5 text-sm capitalize ${
                    kind === k ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 hover:bg-stone-50"
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-stone-300 px-4 py-2 text-sm hover:bg-stone-100"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !name.trim()}
            onClick={save}
            className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-40"
          >
            {busy ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
