"use client";

import { useMemo, useState } from "react";
import { EMOJI_CATEGORIES, EMOJI_LIBRARY } from "@/lib/emoji-library";

/**
 * Browsable + searchable emoji library panel. Renders inline — wrap it in a
 * popover or modal yourself. Search wins over the category tabs; the free-text
 * row at the bottom accepts ANY emoji (from the OS picker, Win+. on Windows).
 */
export function EmojiPicker({
  current,
  onPick,
  autoFocus = false,
}: {
  current?: string | null;
  onPick: (emoji: string) => void;
  autoFocus?: boolean;
}) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState(EMOJI_CATEGORIES[0].id);
  const [custom, setCustom] = useState("");

  const needle = q.trim().toLowerCase();
  const shown = useMemo(
    () =>
      needle
        ? EMOJI_LIBRARY.filter((x) => x.n.includes(needle))
        : EMOJI_LIBRARY.filter((x) => x.c === cat),
    [needle, cat]
  );

  const pickCustom = () => {
    const clean = custom.trim().slice(0, 8);
    if (clean) onPick(clean);
    setCustom("");
  };

  return (
    <div className="w-72 sm:w-80">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="🔍 Search the library…"
        autoFocus={autoFocus}
        className="w-full rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs outline-none focus:border-stone-500"
      />
      {!needle && (
        <div className="mt-2 flex gap-1 overflow-x-auto pb-1" style={{ scrollbarWidth: "thin" }}>
          {EMOJI_CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCat(c.id)}
              className={`shrink-0 whitespace-nowrap rounded-full px-2 py-1 text-[11px] font-medium ${
                cat === c.id
                  ? "bg-stone-900 text-white"
                  : "bg-stone-100 text-stone-600 hover:bg-stone-200"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
      <div className="mt-2 grid max-h-48 grid-cols-8 gap-0.5 overflow-y-auto">
        {shown.map((x, i) => (
          <button
            key={`${x.e}-${i}`}
            type="button"
            onClick={() => onPick(x.e)}
            title={x.n}
            className={`rounded-lg px-1 py-0.5 text-xl leading-7 hover:bg-stone-100 ${
              x.e === current ? "bg-stone-100 ring-1 ring-stone-900" : ""
            }`}
          >
            {x.e}
          </button>
        ))}
        {shown.length === 0 && (
          <p className="col-span-8 py-4 text-center text-xs text-stone-400">
            No matches — paste any emoji below instead.
          </p>
        )}
      </div>
      <div className="mt-2 flex gap-1.5 border-t border-stone-100 pt-2">
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              pickCustom();
            }
          }}
          placeholder="…or any emoji (Win + . opens your keyboard)"
          className="min-w-0 flex-1 rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs outline-none focus:border-stone-500"
        />
        <button
          type="button"
          onClick={pickCustom}
          disabled={!custom.trim()}
          className="rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs font-medium hover:bg-stone-100 disabled:opacity-40"
        >
          Use
        </button>
      </div>
    </div>
  );
}
