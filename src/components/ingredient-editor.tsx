"use client";

import { useState } from "react";

export type IngredientRow = {
  name: string;
  qty: string;
  unit: string;
  note: string;
};

export function IngredientEditor({ initial }: { initial?: IngredientRow[] }) {
  const [rows, setRows] = useState<IngredientRow[]>(
    initial && initial.length > 0 ? initial : [{ name: "", qty: "", unit: "", note: "" }]
  );

  const update = (i: number, key: keyof IngredientRow, v: string) =>
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, [key]: v } : row)));

  const json = JSON.stringify(
    rows
      .filter((r) => r.name.trim())
      .map((r) => ({
        name: r.name,
        qty: r.qty.trim() ? parseFloat(r.qty) : null,
        unit: r.unit || null,
        note: r.note || null,
      }))
  );

  const cell = "rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm";

  return (
    <div className="space-y-2">
      <input type="hidden" name="ingredients_json" value={json} />
      <div className="grid grid-cols-[5rem_5rem_1fr_1fr_2rem] gap-2 text-xs font-medium text-stone-400">
        <span>Qty</span><span>Unit</span><span>Ingredient</span><span>Note</span><span />
      </div>
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[5rem_5rem_1fr_1fr_2rem] gap-2">
          <input value={r.qty} onChange={(e) => update(i, "qty", e.target.value)} placeholder="500" className={cell} inputMode="decimal" />
          <input value={r.unit} onChange={(e) => update(i, "unit", e.target.value)} placeholder="g" className={cell} />
          <input value={r.name} onChange={(e) => update(i, "name", e.target.value)} placeholder="beef mince" className={cell} />
          <input value={r.note} onChange={(e) => update(i, "note", e.target.value)} placeholder="lean" className={cell} />
          <button
            type="button"
            onClick={() => setRows((rows) => rows.filter((_, idx) => idx !== i))}
            className="rounded text-stone-300 hover:bg-red-50 hover:text-red-600"
            title="Remove"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => setRows((r) => [...r, { name: "", qty: "", unit: "", note: "" }])}
        className="rounded-lg border border-dashed border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-500 hover:bg-stone-50"
      >
        + Add ingredient
      </button>
    </div>
  );
}
