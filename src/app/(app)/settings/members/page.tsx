import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/household";
import { setMemberRole, removeMember } from "@/lib/actions/members";
import type { MemberRole } from "@/lib/modules";

const ROLES: MemberRole[] = ["owner", "adult", "child"];

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const membership = await getMembership();
  if (!membership) redirect("/onboarding");
  const { error, saved } = await searchParams;

  const supabase = await createClient();
  const { data: members } = await supabase
    .from("household_members")
    .select("user_id, role, display_name, joined_at")
    .eq("household_id", membership.household_id)
    .order("joined_at");

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      {saved && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {saved === "1" ? "Saved." : saved}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-200 bg-stone-900 text-left text-white">
              <th className="px-4 py-2.5 font-medium">Member</th>
              <th className="px-4 py-2.5 font-medium">Role</th>
              <th className="px-4 py-2.5 font-medium">Joined</th>
              <th className="px-4 py-2.5 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(members ?? []).map((m, i) => (
              <tr
                key={m.user_id}
                className={`border-b border-stone-100 ${i % 2 ? "bg-stone-50" : ""}`}
              >
                <td className="px-4 py-2.5 font-medium">
                  {m.display_name ?? "—"}
                  {m.user_id === user?.id && (
                    <span className="ml-2 rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-500">
                      you
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <form action={setMemberRole} className="inline-flex items-center gap-2">
                    <input type="hidden" name="user_id" value={m.user_id} />
                    <select
                      name="role"
                      defaultValue={m.role}
                      className="rounded-lg border border-stone-300 bg-white px-2 py-1 text-sm capitalize"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                    <button className="rounded-lg border border-stone-300 px-2 py-1 text-xs hover:bg-stone-100">
                      Set
                    </button>
                  </form>
                </td>
                <td className="px-4 py-2.5 text-stone-500">
                  {new Date(m.joined_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <div className="inline-flex items-center gap-2">
                    <Link
                      href={`/settings/members/${m.user_id}`}
                      className="rounded-lg border border-stone-300 px-2.5 py-1 text-xs font-medium hover:bg-stone-100"
                    >
                      Permissions
                    </Link>
                    {m.user_id !== user?.id && (
                      <form action={removeMember}>
                        <input type="hidden" name="user_id" value={m.user_id} />
                        <button className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50">
                          Remove
                        </button>
                      </form>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-stone-400">
        Role sets the default access for every module; per-member overrides live under
        Permissions. A household always keeps at least one owner.
      </p>
    </div>
  );
}
