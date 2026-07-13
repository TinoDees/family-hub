"use client";

import { useState } from "react";

type Ingredient = { id: string; name: string; qty: number | null; unit: string | null; note: string | null };

function fmt(n: number) {
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

export function RecipeScaler({
  baseServings,
  ingredients,
}: {
  baseServings: number;
  ingredients: Ingredient[];
}) {
  const [servings, setServings] = useState(baseServings);
  const factor = servings / baseServings;
  const scaled = servings !== baseServings;

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <span className="text-sm text-stone-500">Cook for</span>
        <button
          type="button"
          onClick={() => setServings((s) => Math.max(1, s - 1))}
          className="h-7 w-7 rounded-lg border border-stone-300 text-sm hover:bg-stone-100"
        >
          −
        </button>
        <span className="w-8 text-center text-sm font-semibold">{servings}</span>
        <button
          type="button"
          onClick={() => setServings((s) => Math.min(50, s + 1))}
          className="h-7 w-7 rounded-lg border border-stone-300 text-sm hover:bg-stone-100"
        >
          +
        </button>
        {scaled && (
          <button
            type="button"
            onClick={() => setServings(baseServings)}
            className="text-xs text-stone-400 underline"
          >
            reset to {baseServings}
          </button>
        )}
      </div>
      <ul className="space-y-1.5 text-sm">
        {ingredients.map((i) => (
          <li key={i.id} className="flex gap-2">
            <span className={`min-w-16 text-right font-medium ${scaled && i.qty !== null ? "text-emerald-700" : "text-stone-600"}`}>
              {i.qty !== null ? `${fmt(Number(i.qty) * factor)}${i.unit ? ` ${i.unit}` : ""}` : ""}
            </span>
            <span>
              {i.name}
              {i.note && <span className="text-stone-400"> ({i.note})</span>}
            </span>
          </li>
        ))}
      </ul>
      {scaled && (
        <p className="mt-2 text-xs text-stone-400">
          Scaled from the base recipe (serves {baseServings}). Times may need adjusting too.
        </p>
      )}
    </div>
  );
}
