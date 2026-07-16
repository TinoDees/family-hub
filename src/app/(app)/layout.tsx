import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/household";
import { getPermissions, visibleModules } from "@/lib/permissions";
import { getNavPrefs, applyNavPrefs } from "@/lib/nav";
import { signOut } from "@/lib/actions/auth";
import { TopNav } from "@/components/top-nav";

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
