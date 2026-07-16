import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/household";
import { getPermissions, visibleModules } from "@/lib/permissions";
import { MODULES } from "@/lib/modules";
import { getNavPrefs, applyNavPrefs, type NavItemPref } from "@/lib/nav";
import { NavEditor } from "@/components/nav-editor";

/** Arrange the menu — every member can arrange their own; owners also set the family default. */
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
  const mine = visibleModules(perms).map((p) => p.module);
  const { household, personal } = await getNavPrefs(supabase, membership.household_id, user.id);

  // seed editors with the currently-effective order, marking hidden items
  const toItems = (base: typeof MODULES, prefs: NavItemPref[] | null) => {
    const hidden = new Set((prefs ?? []).filter((p) => p.hidden).map((p) => p.slug));
    const pos = new Map((prefs ?? []).map((p, i) => [p.slug, i]));
    return base
      .slice()
      .sort((a, b) => (pos.get(a.slug) ?? 999) - (pos.get(b.slug) ?? 999))
      .map((m) => ({ slug: m.slug, name: m.name, icon: m.icon, hidden: hidden.has(m.slug) }));
  };

  // personal editor starts from what the member actually sees (household default applied)
  const mineArranged = applyNavPrefs(mine, household, null);
  const mineHiddenByMe = new Set((personal ?? []).filter((p) => p.hidden).map((p) => p.slug));
  const minePos = new Map((personal ?? []).map((p, i) => [p.slug, i]));
  const mineItems = [
    ...mineArranged,
    // things I hid personally still need to appear in the editor so I can unhide them
    ...mine.filter((m) => !mineArranged.some((x) => x.slug === m.slug)),
  ]
    .sort((a, b) => (minePos.get(a.slug) ?? 999) - (minePos.get(b.slug) ?? 999))
    .map((m) => ({ slug: m.slug, name: m.name, icon: m.icon, hidden: mineHiddenByMe.has(m.slug) }));

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">🎛️ Arrange the menu</h1>
        <p className="mt-1 text-sm text-stone-500">
          Put the things you use most at the front. Hiding something only tidies the menu — it
          doesn&apos;t change who&apos;s allowed to use it.
        </p>
      </div>

      <NavEditor
        scope="mine"
        title="My menu"
        hint="Only you see this order. It sits on top of the family menu."
        initial={mineItems}
      />

      {isOwner && (
        <NavEditor
          scope="household"
          title={`${membership.household.name}'s menu`}
          hint="The default order everyone in the family starts with."
          initial={toItems(MODULES, household)}
        />
      )}
    </div>
  );
}
