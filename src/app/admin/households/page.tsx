import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { MODULES } from "@/lib/modules";

export const dynamic = "force-dynamic";

type MemberRow = {
  user_id: string;
  role: string;
  display_name: string | null;
};

type HouseholdRow = {
  id: string;
  name: string;
  created_at: string;
  household_members: MemberRow[];
};

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function AdminHouseholdsPage() {
  const supabase = createAdminClient();

  const [householdsRes, usersRes, flagsRes] = await Promise.all([
    supabase
      .from("households")
      .select("id, name, created_at, household_members(user_id, role, display_name)")
      .order("created_at", { ascending: false }),
    supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    supabase
      .from("household_module_flags")
      .select("household_id, module_id, enabled"),
  ]);

  const households = (householdsRes.data ?? []) as unknown as HouseholdRow[];
  const emailById = new Map(
    (usersRes.data?.users ?? []).map((u) => [u.id, u.email ?? "—"])
  );
  const flags = flagsRes.data ?? [];
  const disabledByHousehold = new Map<string, string[]>();
  for (const f of flags) {
    if (f.enabled === false) {
      const list = disabledByHousehold.get(f.household_id) ?? [];
      list.push(f.module_id);
      disabledByHousehold.set(f.household_id, list);
    }
  }
  const totalModules = MODULES.length;

  return (
    <div>
      <h1 className="text-2xl font-semibold">Households</h1>
      <p className="mt-1 text-sm text-stone-500">
        {households.length} household{households.length === 1 ? "" : "s"} on the
        platform.
      </p>

      <div className="mt-6 overflow-x-auto rounded-xl border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-200 bg-stone-50 text-left text-xs text-stone-500">
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Members</th>
              <th className="px-4 py-2 font-medium">Owner</th>
              <th className="px-4 py-2 font-medium">Modules</th>
              <th className="px-4 py-2 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {households.map((h) => {
              const owner = h.household_members.find((m) => m.role === "owner");
              const disabled = disabledByHousehold.get(h.id) ?? [];
              return (
                <tr
                  key={h.id}
                  className="border-b border-stone-100 last:border-0 hover:bg-stone-50"
                >
                  <td className="px-4 py-2">
                    <Link
                      href={`/admin/households/${h.id}`}
                      className="font-medium text-teal-700 hover:underline"
                    >
                      {h.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2 tabular-nums">
                    {h.household_members.length}
                  </td>
                  <td className="px-4 py-2">
                    {owner ? (
                      <span>
                        {owner.display_name ?? "—"}{" "}
                        <span className="text-stone-500">
                          ({emailById.get(owner.user_id) ?? "—"})
                        </span>
                      </span>
                    ) : (
                      <span className="text-stone-400">no owner</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {disabled.length === 0 ? (
                      <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs text-teal-700">
                        all {totalModules} enabled
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
                        {disabled.length} disabled: {disabled.join(", ")}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-stone-500">
                    {fmtDate(h.created_at)}
                  </td>
                </tr>
              );
            })}
            {households.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-4 text-stone-500">
                  No households yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
