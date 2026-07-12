import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/household";
import { getPermissions, visibleModules } from "@/lib/permissions";
import { signOut } from "@/lib/actions/auth";
import { AppShell } from "@/components/app-shell";

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
  const modules = visibleModules(perms).map((p) => p.module);

  return (
    <AppShell
      modules={modules}
      householdName={membership.household.name}
      isOwner={membership.role === "owner"}
      userLabel={membership.display_name ?? user.email ?? ""}
      role={membership.role}
      signOutAction={signOut}
    >
      {children}
    </AppShell>
  );
}
