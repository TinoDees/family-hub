import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/household";
import { getPermissions, visibleModules } from "@/lib/permissions";
import { signOut } from "@/lib/actions/auth";
import { Sidebar } from "@/components/sidebar";

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
    <div className="flex min-h-screen">
      <Sidebar
        modules={modules}
        householdName={membership.household.name}
        isOwner={membership.role === "owner"}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-end gap-3 border-b border-stone-200 bg-white px-6 py-3">
          <span className="text-sm text-stone-500">
            {membership.display_name ?? user.email}
            <span className="ml-2 rounded-full bg-stone-100 px-2 py-0.5 text-xs capitalize text-stone-500">
              {membership.role}
            </span>
          </span>
          <form action={signOut}>
            <button className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-medium hover:bg-stone-100">
              Sign out
            </button>
          </form>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
