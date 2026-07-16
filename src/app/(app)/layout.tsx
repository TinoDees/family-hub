import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/household";
import { getPermissions, visibleModules } from "@/lib/permissions";
import { getNavPrefs, applyNavPrefs } from "@/lib/nav";
import { signOut } from "@/lib/actions/auth";
import { TopNav } from "@/components/top-nav";
import IdleLock from "@/components/idle-lock";
import { overnightBoundaryCrossed } from "@/lib/overnight";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const membership = await getMembership();
  if (!membership) redirect("/onboarding");

  // Server-side overnight enforcement (Tracey mig-332 pattern): a restored
  // session must not outlive the household's overnight cut-off even if the
  // client IdleLock never ran (e.g. browser closed over midnight).
  // last_sign_in_at moves only on a real sign-in, so this fires exactly once
  // per crossed cut-off. A Server Component can't clear cookies, so we bounce
  // to the logout route handler which can.
  const lock = membership.household;
  if (
    lock.idle_lock_enabled &&
    lock.overnight_logout_at &&
    user.last_sign_in_at &&
    overnightBoundaryCrossed(
      new Date(user.last_sign_in_at),
      new Date(),
      lock.timezone ?? "Australia/Sydney",
      lock.overnight_logout_at
    )
  ) {
    redirect("/auth/logout?reason=overnight");
  }

  const { data: hasPin } = await supabase.rpc("has_user_pin");

  const perms = await getPermissions(
    membership.household_id,
    user.id,
    membership.role
  );
  const allowed = visibleModules(perms).map((p) => p.module);

  // permissions decide WHAT; nav prefs decide the ORDER
  // (personal → household → platform global → built-in default)
  const prefs = await getNavPrefs(supabase, membership.household_id, user.id);
  const modules = applyNavPrefs(allowed, prefs);

  return (
    <div className="flex min-h-screen flex-col">
      <IdleLock
        enabled={lock.idle_lock_enabled}
        idleMinutes={lock.idle_lock_minutes ?? 30}
        overnightAt={lock.overnight_logout_at}
        hasPin={Boolean(hasPin)}
        userName={membership.display_name ?? user.email ?? ""}
        timezone={lock.timezone ?? "Australia/Sydney"}
      />
      <TopNav
        modules={modules}
        householdName={membership.household.name}
        isOwner={membership.role === "owner"}
        userLabel={membership.display_name ?? user.email ?? ""}
        role={membership.role}
        signOutAction={signOut}
      />
      <main className="mx-auto w-full max-w-7xl flex-1 p-4 md:p-6">{children}</main>
    </div>
  );
}
