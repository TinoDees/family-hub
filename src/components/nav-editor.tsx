"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveNavPrefs, resetNavPrefs, type NavScope } from "@/lib/actions/nav";

type Item = { slug: string; name: string; icon: string; hidden: boolean };

/**
 * Dead-simple menu arranger: up/down to reorder, eye to show/hide, Save.
 * No drag-and-drop, no jargon — anyone in the family can use it.
 */
export function NavEditor({
  scope,
  title,
  hint,
  initial,
}: {
  scope: NavScope;
  title: string;
  hint: string;
  initial: Item[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    setItems(next);
    setDirty(true);
    setMsg(null);
  };

  const toggle = (i: number) => {
    const next = [...items];
    next[i] = { ...next[i], hidden: !next[i].hidden };
    setItems(next);
    setDirty(true);
    setMsg(null);
  };

  const save = async () => {
    setBusy(true);
    const res = await saveNavPrefs(scope, items.map((i) => ({ slug: i.slug, hidden: i.hidden })));
    setBusy(false);
    if (!res.ok) {
      setMsg(res.error ?? "Could not save");
      return;
    }
    setDirty(false);
    setMsg("Saved — your menu is updated.");
    router.refresh();
  };

  const reset = async () => {
    if (!window.confirm("Put this menu back to the default?")) return;
    setBusy(true);
    const res = await resetNavPrefs(scope);
    setBusy(false);
    if (!res.ok) {
      setMsg(res.error ?? "Could not reset");
      return;
    }
    setDirty(false);
    setMsg("Back to the default.");
    router.refresh();
  };

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-5">
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-stone-500">{hint}</p>
      {msg && (
        <p className={`mt-3 rounded-lg px-3 py-2 text-sm ${msg.startsWith("Saved") || msg.startsWith("Back") ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
          {msg}
        </p>
      )}
      <ul className="mt-4 space-y-1.5">
        {items.map((item, i) => (
          <li
            key={item.slug}
            className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${
              item.hidden ? "border-stone-100 bg-stone-50 opacity-60" : "border-stone-200 bg-white"
            }`}
          >
            <span className="text-xl">{item.icon}</span>
            <span className="flex-1 text-sm font-medium">{item.name}</span>
            {item.hidden && <span className="text-xs text-stone-400">hidden</span>}
            <button
              type="button"
              onClick={() => toggle(i)}
              title={item.hidden ? "Show in menu" : "Hide from menu"}
              className="rounded-lg border border-stone-200 px-2 py-1 text-sm hover:bg-stone-100"
            >
              {item.hidden ? "🙈" : "👁️"}
            </button>
            <button
              type="button"
              onClick={() => move(i, -1)}
              disabled={i === 0}
              title="Move up"
              className="rounded-lg border border-stone-200 px-2 py-1 text-sm hover:bg-stone-100 disabled:opacity-30"
            >
              ↑
            </button>
            <button
              type="button"
              onClick={() => move(i, 1)}
              disabled={i === items.length - 1}
              title="Move down"
              className="rounded-lg border border-stone-200 px-2 py-1 text-sm hover:bg-stone-100 disabled:opacity-30"
            >
              ↓
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={busy || !dirty}
          className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-40"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={reset}
          disabled={busy}
          className="rounded-lg border border-stone-300 px-4 py-2 text-sm hover:bg-stone-100"
        >
          Reset to default
        </button>
        {dirty && <span className="text-xs font-medium text-amber-600">Not saved yet</span>}
      </div>
    </div>
  );
}
