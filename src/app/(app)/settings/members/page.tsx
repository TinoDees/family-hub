import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/household";
import { setMemberRole, createChildAccount } from "@/lib/actions/members";
import { getAccountInfo } from "@/lib/actions/admin-users";
import { inputCls } from "@/components/auth-card";
import type { MemberRole } from "@/lib/modules";

const ROLES: MemberRole[] = ["owner", "adult", "child"];

function StatusPill({ blocked }: { blocked?: boolean }) {
  return blocked ? (
    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Blocked</span>
  ) : (
    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">Active</span>
  );
}

function fmtDate(d?: string | null) {
  return d ? new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short" }) : "—";
}

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const membership = await getMembership();
  if (!membership) redirect("/onboarding");
  const { error, saved } = await searchParams;

  const supabase = await createClient();
  const [{ data: members }, { data: guests }, { data: pendingInvites }, { data: pendingTripInvites }] =
    await Promise.all([
      supabase
        .from("household_members")
        .select("user_id, role, display_name, joined_at")
        .eq("household_id", membership.household_id)
        .order("joined_at"),
      supabase
        .from("trip_participants")
        .select("id, user_id, name, email, is_manager, trips!inner(id, name, household_id)")
        .eq("trips.household_id", membership.household_id)
        .not("user_id", "is", null),
      supabase
        .from("invites")
        .select("id, email, role, created_at, expires_at")
        .eq("household_id", membership.household_id)
        .is("accepted_at", null)
        .is("revoked_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false }),
      supabase
        .from("trip_invites")
        .select("id, created_at, expires_at, trip_participants!inner(name, email), trips!inner(name, household_id)")
        .eq("trips.household_id", membership.household_id)
        .is("accepted_at", null)
        .is("revoked_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false }),
    ]);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const viewerIsOwner = membership.role === "owner";

  const memberIds = new Set((members ?? []).map((m) => m.user_id));
  // one row per guest account (a guest can be on several trips)
  const guestByUser = new Map<
    string,
    { user_id: string; name: string; email: string | null; trips: string[]; is_manager: boolean }
  >();
  for (const g of guests ?? []) {
    if (!g.user_id || memberIds.has(g.user_id)) continue;
    const trip = (g.trips as unknown as { name: string })?.name ?? "Trip";
    const cur = guestByUser.get(g.user_id);
    if (cur) {
      cur.trips.push(trip);
      cur.is_manager = cur.is_manager || g.is_manager;
    } else {
      guestByUser.set(g.user_id, {
        user_id: g.user_id,
        name: g.name,
        email: g.email,
        trips: [trip],
        is_manager: g.is_manager,
      });
    }
  }
  const guestList = [...guestByUser.values()];

  const accounts = new Map(
    await Promise.all(
      [...memberIds, ...guestList.map((g) => g.user_id)].map(
        async (id) => [id, await getAccountInfo(id)] as const
      )
    )
  );

  return (
    <div className="space-y-6">
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {saved && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {saved === "1" ? "Saved." : saved}
        </p>
      )}

      <section>
        <h3 className="mb-2 text-sm font-semibold">👨‍👩‍👧‍👦 Family members</h3>
        <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-900 text-left text-white">
                <th className="px-4 py-2.5 font-medium">Member</th>
                <th className="px-4 py-2.5 font-medium">Email / username</th>
                <th className="px-4 py-2.5 font-medium">Role</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Last sign-in</th>
                <th className="px-4 py-2.5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(members ?? []).map((m, i) => {
                const acc = accounts.get(m.user_id);
                const email = acc?.email?.endsWith("@kids.nestly.internal")
                  ? acc.email.split("@")[0] + " (username)"
                  : acc?.email;
                return (
                  <tr key={m.user_id} className={`border-b border-stone-100 ${i % 2 ? "bg-stone-50" : ""}`}>
                    <td className="px-4 py-2.5 font-medium">
                      {m.display_name ?? "—"}
                      {m.user_id === user?.id && (
                        <span className="ml-2 rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-500">you</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-stone-500">{email ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      {m.role === "owner" && m.user_id !== user?.id ? (
                        <span className="rounded-full bg-stone-900 px-2.5 py-1 text-xs font-medium capitalize text-white">
                          owner
                        </span>
                      ) : (
                        <form action={setMemberRole} className="inline-flex items-center gap-2">
                          <input type="hidden" name="user_id" value={m.user_id} />
                          <select
                            name="role"
                            defaultValue={m.role}
                            className="rounded-lg border border-stone-300 bg-white px-2 py-1 text-sm capitalize"
                          >
                            {ROLES.filter((r) => r !== "owner" || viewerIsOwner).map((r) => (
                              <option key={r} value={r}>
                                {r}
                              </option>
                            ))}
                          </select>
                          <button className="rounded-lg border border-stone-300 px-2 py-1 text-xs hover:bg-stone-100">
                            Set
                          </button>
                        </form>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusPill blocked={acc?.blocked} />
                    </td>
                    <td className="px-4 py-2.5 text-stone-500">{fmtDate(acc?.lastSignIn)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <Link
                        href={`/settings/members/${m.user_id}`}
                        className="rounded-lg border border-stone-300 px-2.5 py-1 text-xs font-medium hover:bg-stone-100"
                      >
                        Manage
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {guestList.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold">✈️ Trip guests</h3>
          <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-900 text-left text-white">
                  <th className="px-4 py-2.5 font-medium">Guest</th>
                  <th className="px-4 py-2.5 font-medium">Email</th>
                  <th className="px-4 py-2.5 font-medium">Trips</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Last sign-in</th>
                  <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {guestList.map((g, i) => {
                  const acc = accounts.get(g.user_id);
                  return (
                    <tr key={g.user_id} className={`border-b border-stone-100 ${i % 2 ? "bg-stone-50" : ""}`}>
                      <td className="px-4 py-2.5 font-medium">
                        {g.name}
                        {g.is_manager && (
                          <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-700">
                            family manager
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-stone-500">{g.email ?? acc?.email ?? "—"}</td>
                      <td className="px-4 py-2.5 text-stone-500">{g.trips.join(", ")}</td>
                      <td className="px-4 py-2.5">
                        <StatusPill blocked={acc?.blocked} />
                      </td>
                      <td className="px-4 py-2.5 text-stone-500">{fmtDate(acc?.lastSignIn)}</td>
                      <td className="px-4 py-2.5 text-right">
                        <Link
                          href={`/settings/members/${g.user_id}`}
                          className="rounded-lg border border-stone-300 px-2.5 py-1 text-xs font-medium hover:bg-stone-100"
                        >
                          Manage
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {((pendingInvites?.length ?? 0) > 0 || (pendingTripInvites?.length ?? 0) > 0) && (
        <section>
          <h3 className="mb-2 text-sm font-semibold">⏳ Pending invites</h3>
          <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
            <ul className="divide-y divide-stone-100 text-sm">
              {(pendingInvites ?? []).map((inv) => (
                <li key={inv.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                  <span className="font-medium">{inv.email}</span>
                  <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs capitalize text-stone-500">
                    family · {inv.role}
                  </span>
                  <span className="ml-auto text-xs text-stone-400">
                    sent {fmtDate(inv.created_at)} · expires {fmtDate(inv.expires_at)}
                  </span>
                  <Link href="/settings/invites" className="text-xs text-sky-600 hover:underline">
                    Manage
                  </Link>
                </li>
              ))}
              {(pendingTripInvites ?? []).map((inv) => {
                const part = inv.trip_participants as unknown as { name: string; email: string | null };
                const trip = inv.trips as unknown as { name: string };
                return (
                  <li key={inv.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                    <span className="font-medium">{part?.email ?? part?.name}</span>
                    <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs text-sky-700">
                      trip · {trip?.name}
                    </span>
                    <span className="ml-auto text-xs text-stone-400">
                      sent {fmtDate(inv.created_at)} · expires {fmtDate(inv.expires_at)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      )}

      <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
        💡 <strong>Adding family:</strong> adults get an <Link href="/settings/invites" className="underline">email invite</Link> and
        set their own password. Children don&apos;t need email — create their account below,
        then they sign in with just the username and password.{" "}
        <Link href="/help" className="underline">Full guide →</Link>
      </div>

      <section className="rounded-xl border border-stone-200 bg-white p-5">
        <h3 className="text-sm font-semibold">Add a child account (no email needed)</h3>
        <p className="mt-1 text-xs text-stone-400">
          Kids sign in with just a username and password — perfect for a Wi-Fi-only phone or tablet.
        </p>
        <form action={createChildAccount} className="mt-3 flex flex-wrap items-end gap-3">
          <div className="w-40">
            <label className="mb-1 block text-xs font-medium">Name</label>
            <input name="name" required placeholder="Rosie" autoComplete="off" className={inputCls} />
          </div>
          <div className="w-40">
            <label className="mb-1 block text-xs font-medium">Username</label>
            <input name="username" required minLength={3} placeholder="rosie" autoComplete="off" className={`${inputCls} lowercase`} />
          </div>
          <div className="w-48">
            <label className="mb-1 block text-xs font-medium">Password</label>
            <input name="password" type="text" required minLength={6} placeholder="min 6 characters" autoComplete="off" className={inputCls} />
          </div>
          <button className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700">
            Create child account
          </button>
        </form>
      </section>

      <p className="text-xs text-stone-400">
        Manage opens the full account panel: permissions, set password, block, remove, delete.
        Role sets default module access; per-member overrides live inside Manage. A household
        always keeps at least one owner.
      </p>
    </div>
  );
}
