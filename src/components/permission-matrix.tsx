"use client";

import { useState, useTransition } from "react";
import { savePermissions } from "@/lib/actions/members";
import type { Access, MemberRole } from "@/lib/modules";

type Row = {
  slug: string;
  name: string;
  icon: string;
  access: Access;
  roleDefault: Access;
};

const LEVELS: Access[] = ["none", "view", "edit"];

export function PermissionMatrix({
  targetUserId,
  targetRole,
  rows,
}: {
  targetUserId: string;
  targetRole: MemberRole;
  rows: Row[];
}) {
  const [state, setState] = useState<Record<string, Access>>(
    Object.fromEntries(rows.map((r) => [r.slug, r.access]))
  );
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  const dirty = rows.some((r) => state[r.slug] !== r.access);

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-200 bg-stone-900 text-left text-white">
              <th className="px-4 py-2.5 font-medium">Module</th>
              <th className="px-4 py-2.5 font-medium">Access</th>
              <th className="px-4 py-2.5 font-medium">Role default</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={r.slug}
                className={`border-b border-stone-100 ${i % 2 ? "bg-stone-50" : ""}`}
              >
                <td className="px-4 py-2.5 font-medium">
                  <span className="mr-2">{r.icon}</span>
                  {r.name}
                  {state[r.slug] !== r.roleDefault && (
                    <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                      override
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <div className="inline-flex overflow-hidden rounded-lg border border-stone-300">
                    {LEVELS.map((level) => (
                      <button
                        key={level}
                        type="button"
                        onClick={() =>
                          setState((s) => ({ ...s, [r.slug]: level }))
                        }
                        className={`px-3 py-1 text-xs font-medium capitalize transition-colors ${
                          state[r.slug] === level
                            ? level === "none"
                              ? "bg-stone-500 text-white"
                              : level === "view"
                                ? "bg-sky-600 text-white"
                                : "bg-emerald-600 text-white"
                            : "bg-white text-stone-500 hover:bg-stone-100"
                        }`}
                      >
                        {level}
                      </button>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-2.5 capitalize text-stone-400">{r.roleDefault}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={!dirty || pending}
          onClick={() =>
            startTransition(async () => {
              const res = await savePermissions(targetUserId, targetRole, state);
              setResult(res.ok ? "Saved." : (res.error ?? "Something went wrong"));
              if (res.ok) window.location.reload();
            })
          }
          className="rounded-lg bg-stone-900 px-5 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-40"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
        {result && <span className="text-sm text-stone-500">{result}</span>}
      </div>
    </div>
  );
}
