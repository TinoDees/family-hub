import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { MODULES } from "@/lib/modules";
import { setModuleFlag } from "./actions";

export const dynamic = "force-dynamic";

type MemberRow = {
  user_id: string;
  role: string;
  display_name: string | null;
  joined_at: string;
};

type HouseholdRow = {
  id: string;
  name: string;
  invite_code: string;
  base_currency: string;
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

export default async function AdminHouseholdDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createAdminClient();

  const [householdRes, usersRes, flagsRes] = await Promise.all([
    supabase
      .from("households")
      .select(
        "id, name, invite_code, base_currency, created_at, household_members(user_id, role, display_name, joined_at)"
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    supabase
      .from("household_module_flags")
      .select("module_id, enabled")
      .eq("household_id", id),
  ]);

  const household = householdRes.data as unknown as HouseholdRow | null;
  if (!household) notFound();

  const emailById = new Map(
    (usersRes.data?.users ?? []).map((u) => [u.id, u.email ?? "—"])
  );
  const flagByModule = new Map(
    (flagsRes.data ?? []).map((f) => [f.module_id as string, f.enabled as boolean])
  );

  return (
    <div>
      <Link
        href="/admin/households"
        className="text-sm text-stone-500 hover:text-stone-900"
      >
        ← All households
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">{household.name}</h1>
      <p className="mt-1 text-sm text-stone-500">
        Created {fmtDate(household.created_at)} · Base currency{" "}
        {household.base_currency} · Invite code{" "}
        <span className="font-mono">{household.invite_code}</span>
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-stone-200 bg-white p-5">
          <h2 className="text-sm font-semibold">
            Members ({household.household_members.length})
          </h2>
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-left text-xs text-stone-500">
                <th className="py-1.5 pr-2 font-medium">Name</th>
                <th className="py-1.5 pr-2 font-medium">Email</th>
                <th className="py-1.5 pr-2 font-medium">Role</th>
                <th className="py-1.5 font-medium">Joined</th>
              </tr>
            </thead>
            <tbody>
              {household.household_members.map((m) => (
                <tr
                  key={m.user_id}
                  className="border-b border-stone-100 last:border-0"
                >
                  <td className="py-1.5 pr-2 font-medium">
                    {m.display_name ?? "—"}
                  </td>
                  <td className="py-1.5 pr-2 text-stone-500">
                    {emailById.get(m.user_id) ?? "—"}
                  </td>
                  <td className="py-1.5 pr-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        m.role === "owner"
                          ? "bg-teal-50 text-teal-700"
                          : m.role === "adult"
                            ? "bg-stone-100 text-stone-700"
                            : "bg-sky-50 text-sky-700"
                      }`}
                    >
                      {m.role}
                    </span>
                  </td>
                  <td className="py-1.5 text-stone-500">{fmtDate(m.joined_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-xl border border-stone-200 bg-white p-5">
          <h2 className="text-sm font-semibold">Modules</h2>
          <p className="mt-1 text-xs text-stone-500">
            Platform-level switches (stored in household_module_flags). Not yet
            enforced in app permission logic — wiring comes later.
          </p>
          <ul className="mt-3 divide-y divide-stone-100">
            {MODULES.map((m) => {
              const enabled = flagByModule.get(m.slug) ?? true;
              return (
                <li
                  key={m.slug}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span>{m.icon}</span>
                    <span
                      className={`truncate text-sm font-medium ${
                        enabled ? "" : "text-stone-400 line-through"
                      }`}
                    >
                      {m.name}
                    </span>
                    {m.status === "placeholder" && (
                      <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-500">
                        placeholder
                      </span>
                    )}
                  </div>
                  <form action={setModuleFlag}>
                    <input type="hidden" name="household_id" value={household.id} />
                    <input type="hidden" name="module_id" value={m.slug} />
                    <input
                      type="hidden"
                      name="enabled"
                      value={enabled ? "false" : "true"}
                    />
                    <button
                      type="submit"
                      className={`rounded-lg border px-3 py-1 text-xs font-medium transition-colors ${
                        enabled
                          ? "border-stone-200 bg-white text-stone-600 hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                          : "border-teal-600 bg-teal-600 text-white hover:bg-teal-700"
                      }`}
                    >
                      {enabled ? "Disable" : "Enable"}
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
