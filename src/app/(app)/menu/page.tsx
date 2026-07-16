import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/household";
import { getPermissions, visibleModules } from "@/lib/permissions";
import { getNavPrefs } from "@/lib/nav";
import { layoutToTree } from "@/lib/nav-catalog";
import { NavBuilderTabs } from "@/components/nav-builder";

/**
 * The menu builder — every member arranges their own menu; the owner also
 * gets the family default (scope switch, like Tracey's tenant/user split).
 * The personal builder starts from the personal layout if saved, else the
 * family default, and only shows modules that member may open.
 */
export default async function MenuPage() {
  const membership = await getMembership();
  if (!membership) redirect("/onboarding");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const isOwner = membership.role === "owner";
  const perms = await getPermissions(membership.household_id, user.id, membership.role);
  const mineSlugs = visibleModules(perms).map((p) => p.module.slug);
  const { household, personal } = await getNavPrefs(supabase, membership.household_id, user.id);

  const mineTree = layoutToTree(personal ?? household, mineSlugs);
  const householdTree = isOwner ? layoutToTree(household, null) : null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">🎛️ Arrange the menu</h1>
        <p className="mt-1 max-w-2xl text-sm text-stone-500">
          Group things the way your family thinks — drag them between menus and sub-menus, make new
          menus, hide what you don&apos;t use. Nothing changes until you Save. Who can open what is
          set by permissions and always applies on top.
        </p>
      </div>

      <NavBuilderTabs mine={mineTree} household={householdTree} householdName={membership.household.name} />
    </div>
  );
}
