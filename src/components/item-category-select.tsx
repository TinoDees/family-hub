"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GROCERY_CATEGORIES } from "@/lib/groceries";
import { setItemCategoryInline } from "@/lib/actions/shopping";

/** Quiet per-item category correction on a shopping list row. */
export function ItemCategorySelect({ itemId, category }: { itemId: string; category: string }) {
  const router = useRouter();
  const [value, setValue] = useState(category);

  return (
    <select
      value={value}
      onChange={async (e) => {
        const next = e.target.value;
        const prev = value;
        setValue(next);
        const res = await setItemCategoryInline(itemId, next);
        if (!res.ok) setValue(prev);
        else router.refresh();
      }}
      className="rounded-lg border border-transparent bg-transparent px-1 py-0.5 text-xs text-stone-400 hover:border-stone-200"
      title="Category"
    >
      {GROCERY_CATEGORIES.map((c) => (
        <option key={c.id} value={c.id}>
          {c.emoji} {c.label}
        </option>
      ))}
    </select>
  );
}
