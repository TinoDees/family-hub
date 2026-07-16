import type { SupabaseClient } from "@supabase/supabase-js";
import type { ModuleDef } from "@/lib/modules";
import { parseLayout, resolveNav, type NavLayout, type NavNode } from "@/lib/nav-catalog";

/**
 * Navigation preferences (Tracey-style, family-sized).
 * Order of application: permissions decide WHAT is available; the layout
 * (member's personal row if saved, else the household default, else the
 * built-in default) decides how it is ARRANGED — order, grouping under
 * menus/sub-menus, hiding. Arranging can never expose a module permissions
 * removed: resolveNav gates by allowed slugs ON TOP of the layout.
 *
 * Same call pattern as before — (app)/layout.tsx does
 *   getNavPrefs(...) → applyNavPrefs(allowed, household, personal) → TopNav
 * but the result is now the resolved render tree (NavNode[]).
 */

export type { NavLayout, NavNode };

export function applyNavPrefs(
  modules: ModuleDef[],
  household: NavLayout | null,
  personal: NavLayout | null
): NavNode[] {
  return resolveNav(household, personal, modules.map((m) => m.slug));
}

/**
 * Load both scopes from nav_prefs. Legacy rows (the old flat [{slug, hidden}]
 * array) are converted to the new tree on read; unusable junk becomes null.
 */
export async function getNavPrefs(
  client: SupabaseClient,
  householdId: string,
  userId: string
): Promise<{ household: NavLayout | null; personal: NavLayout | null }> {
  const { data } = await client
    .from("nav_prefs")
    .select("user_id, layout")
    .eq("household_id", householdId)
    .or(`user_id.is.null,user_id.eq.${userId}`);
  let household: NavLayout | null = null;
  let personal: NavLayout | null = null;
  for (const row of data ?? []) {
    const layout = parseLayout(row.layout);
    if (row.user_id === null) household = layout;
    else personal = layout;
  }
  return { household, personal };
}
