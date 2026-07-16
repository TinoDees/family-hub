import type { SupabaseClient } from "@supabase/supabase-js";
import type { ModuleDef } from "@/lib/modules";
import { parseLayout, resolveNav, type NavLayout, type NavNode } from "@/lib/nav-catalog";

/**
 * Navigation preferences (Tracey-style, family-sized).
 * Order of application: permissions decide WHAT is available; the layout
 * decides how it is ARRANGED — order, grouping under menus/sub-menus, hiding.
 * Scope precedence (most specific wins, wholesale): the member's personal row
 * → the household default row → the platform-wide global default (set by the
 * platform admin at /admin/navigation, stored in platform_settings under key
 * 'nav_default') → the built-in default. Arranging can never expose a module
 * permissions removed: resolveNav gates by allowed slugs ON TOP of the layout.
 *
 * Call pattern — (app)/layout.tsx does
 *   getNavPrefs(...) → applyNavPrefs(allowed, prefs) → TopNav
 * and the result is the resolved render tree (NavNode[]).
 */

export type { NavLayout, NavNode };

export type NavPrefs = {
  household: NavLayout | null;
  personal: NavLayout | null;
  global: NavLayout | null;
};

export function applyNavPrefs(modules: ModuleDef[], prefs: NavPrefs): NavNode[] {
  return resolveNav(
    prefs.personal ?? prefs.household ?? prefs.global,
    modules.map((m) => m.slug)
  );
}

/**
 * Load all three scopes: the household + personal rows from nav_prefs, and the
 * platform-wide default from platform_settings (key 'nav_default', readable by
 * any authenticated user; written only via the service-role client from the
 * admin panel). Legacy rows (the old flat [{slug, hidden}] array) are converted
 * to the new tree on read; unusable junk becomes null.
 */
export async function getNavPrefs(
  client: SupabaseClient,
  householdId: string,
  userId: string
): Promise<NavPrefs> {
  const [prefsRes, globalRes] = await Promise.all([
    client
      .from("nav_prefs")
      .select("user_id, layout")
      .eq("household_id", householdId)
      .or(`user_id.is.null,user_id.eq.${userId}`),
    client.from("platform_settings").select("value").eq("key", "nav_default").maybeSingle(),
  ]);

  let household: NavLayout | null = null;
  let personal: NavLayout | null = null;
  for (const row of prefsRes.data ?? []) {
    const layout = parseLayout(row.layout);
    if (row.user_id === null) household = layout;
    else personal = layout;
  }
  return { household, personal, global: parseLayout(globalRes.data?.value ?? null) };
}
