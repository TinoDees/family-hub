import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type MembershipRow = {
  user_id: string;
  role: string;
  display_name: string | null;
  household: { id: string; name: string } | null;
};

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function AdminUsersPage() {
  const supabase = createAdminClient();

  const [usersRes, membersRes, adminsRes] = await Promise.all([
    supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    supabase
      .from("household_members")
      .select("user_id, role, display_name, household:households(id, name)"),
    supabase.from("platform_admins").select("user_id"),
  ]);

  const users = (usersRes.data?.users ?? []).slice().sort((a, b) =>
    a.created_at < b.created_at ? 1 : -1
  );
  const memberships = (membersRes.data ?? []) as unknown as MembershipRow[];
  const membershipsByUser = new Map<string, MembershipRow[]>();
  for (const m of memberships) {
    const list = membershipsByUser.get(m.user_id) ?? [];
    list.push(m);
    membershipsByUser.set(m.user_id, list);
  }
  const adminIds = new Set((adminsRes.data ?? []).map((a) => a.user_id as string));

  return (
    <div>
      <h1 className="text-2xl font-semibold">Users</h1>
      <p className="mt-1 text-sm text-stone-500">
        {users.length} user{users.length === 1 ? "" : "s"} registered.
      </p>

      <div className="mt-6 overflow-x-auto rounded-xl border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-200 bg-stone-50 text-left text-xs text-stone-500">
              <th className="px-4 py-2 font-medium">Email</th>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Household · role</th>
              <th className="px-4 py-2 font-medium">Created</th>
              <th className="px-4 py-2 font-medium">Last sign-in</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const mships = membershipsByUser.get(u.id) ?? [];
              const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
              const name =
                mships.find((m) => m.display_name)?.display_name ??
                (typeof meta.display_name === "string" ? meta.display_name : null) ??
                (typeof meta.full_name === "string" ? meta.full_name : null) ??
                "—";
              return (
                <tr
                  key={u.id}
                  className="border-b border-stone-100 last:border-0 hover:bg-stone-50"
                >
                  <td className="px-4 py-2">
                    <span className="font-medium">{u.email ?? "—"}</span>
                    {adminIds.has(u.id) && (
                      <span className="ml-2 rounded-full bg-stone-900 px-2 py-0.5 text-xs text-white">
                        platform admin
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2">{name}</td>
                  <td className="px-4 py-2">
                    {mships.length === 0 ? (
                      <span className="text-stone-400">no household</span>
                    ) : (
                      <span className="flex flex-wrap gap-1.5">
                        {mships.map((m, i) => (
                          <span key={i}>
                            {m.household ? (
                              <Link
                                href={`/admin/households/${m.household.id}`}
                                className="text-teal-700 hover:underline"
                              >
                                {m.household.name}
                              </Link>
                            ) : (
                              "—"
                            )}
                            <span className="text-stone-500"> · {m.role}</span>
                          </span>
                        ))}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-stone-500">{fmtDate(u.created_at)}</td>
                  <td className="px-4 py-2 text-stone-500">
                    {fmtDate(u.last_sign_in_at)}
                  </td>
                </tr>
              );
            })}
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-4 text-stone-500">
                  No users yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
