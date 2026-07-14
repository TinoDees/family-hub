"use client";

import { useState } from "react";

type Ingredient = { id: string; name: string; qty: number | null; unit: string | null; note: string | null };

function fmt(n: number) {
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

type UnitSystem = "metric" | "imperial";

// deterministic conversions — no AI needed, instant and exact
const TO_IMPERIAL: Record<string, { unit: string; factor: number }> = {
  g: { unit: "oz", factor: 1 / 28.3495 },
  kg: { unit: "lb", factor: 2.20462 },
  ml: { unit: "fl oz", factor: 1 / 29.5735 },
  l: { unit: "qt", factor: 1.05669 },
  cm: { unit: "in", factor: 1 / 2.54 },
};
const TO_METRIC: Record<string, { unit: string; factor: number }> = {
  oz: { unit: "g", factor: 28.3495 },
  lb: { unit: "kg", factor: 1 / 2.20462 },
  "fl oz": { unit: "ml", factor: 29.5735 },
  qt: { unit: "ml", factor: 946.353 },
  in: { unit: "cm", factor: 2.54 },
};

function convertUnit(qty: number, unit: string | null, system: UnitSystem): { qty: number; unit: string | null } {
  if (!unit) return { qty, unit };
  const key = unit.toLowerCase().trim();
  const table = system === "imperial" ? TO_IMPERIAL : TO_METRIC;
  const conv = table[key];
  if (!conv) return { qty, unit };
  return { qty: qty * conv.factor, unit: conv.unit };
}

export function RecipeScaler({
  baseServings,
  ingredients,
}: {
  baseServings: number;
  ingredients: Ingredient[];
}) {
  const [servings, setServings] = useState(baseServings);
  const [system, setSystem] = useState<UnitSystem>("metric");
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
        <span className="ml-auto flex overflow-hidden rounded-lg border border-stone-300 text-xs">
          {(["metric", "imperial"] as const).map((sys) => (
            <button
              key={sys}
              type="button"
              onClick={() => setSystem(sys)}
              className={`px-2.5 py-1 capitalize ${system === sys ? "bg-stone-900 text-white" : "hover:bg-stone-100"}`}
            >
              {sys}
            </button>
          ))}
        </span>
      </div>
      <ul className="space-y-1.5 text-sm">
        {ingredients.map((i) => (
          <li key={i.id} className="flex gap-2">
            <span className={`min-w-16 text-right font-medium ${scaled && i.qty !== null ? "text-emerald-700" : "text-stone-600"}`}>
              {i.qty !== null
                ? (() => {
                    const c = convertUnit(Number(i.qty) * factor, i.unit, system);
                    return `${fmt(c.qty)}${c.unit ? ` ${c.unit}` : ""}`;
                  })()
                : ""}
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
