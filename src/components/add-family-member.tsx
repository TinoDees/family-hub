"use client";

import { useState } from "react";
import { addParticipant } from "@/lib/actions/trips";

type Option = { user_id: string; email: string; display_name: string };

const inputCls =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 outline-none focus:border-stone-500 focus:ring-2 focus:ring-stone-200";

export function AddFamilyMember({
  tripId,
  familyId,
  householdOptions,
}: {
  tripId: string;
  familyId: string;
  /** household members not yet on the trip — shown as a picker; empty for outside families */
  householdOptions: Option[];
}) {
  const hasPicker = householdOptions.length > 0;
  const [mode, setMode] = useState<"pick" | "type">(hasPicker ? "pick" : "type");
  const [selected, setSelected] = useState("");

  const chosen = householdOptions.find((o) => o.user_id === selected);

  return (
    <form action={addParticipant} className="mt-3 space-y-2">
      <input type="hidden" name="trip_id" value={tripId} />
      <input type="hidden" name="family_id" value={familyId} />

      {mode === "pick" ? (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="min-w-56 flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">— pick a family member —</option>
            {householdOptions.map((o) => (
              <option key={o.user_id} value={o.user_id}>
                {o.display_name ?? o.email} ({o.email})
              </option>
            ))}
          </select>
          {chosen && (
            <>
              <input type="hidden" name="user_id" value={chosen.user_id} />
              <input type="hidden" name="name" value={chosen.display_name ?? chosen.email} />
              <input type="hidden" name="email" value={chosen.email} />
            </>
          )}
          <label className="flex items-center gap-1.5 text-xs text-stone-500">
            <input type="checkbox" name="is_manager" className="rounded border-stone-300" /> manager
          </label>
          <button
            disabled={!chosen}
            className="rounded-lg bg-stone-900 px-4 py-2 text-xs font-medium text-white hover:bg-stone-700 disabled:opacity-40"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => setMode("type")}
            className="text-xs text-sky-600 underline"
          >
            someone else
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <input name="name" required placeholder="Name" autoComplete="off" className={`${inputCls} w-36 flex-none`} />
          <input name="email" type="email" placeholder="email (for the invite)" autoComplete="off" className={`${inputCls} min-w-48 flex-1`} />
          <label className="flex items-center gap-1.5 text-xs text-stone-500">
            <input type="checkbox" name="is_manager" className="rounded border-stone-300" /> manager
          </label>
          <button className="rounded-lg border border-stone-300 px-3 py-2 text-xs font-medium hover:bg-stone-100">
            Add member
          </button>
          {hasPicker && (
            <button type="button" onClick={() => setMode("pick")} className="text-xs text-sky-600 underline">
              pick from family
            </button>
          )}
        </div>
      )}
    </form>
  );
}
