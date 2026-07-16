import type { SupabaseClient } from "@supabase/supabase-js";
import type { ModuleDef } from "@/lib/modules";

/**
 * Navigation preferences (Tracey-style, family-sized).
 * Order of application: permissions decide WHAT is available, the household
 * default arranges it, the member's personal layout arranges it further.
 * Arranging (order + hide) can never expose a module permissions removed.
 */
export type NavItemPref = { slug: string; hidden?: boolean };

export function applyNavPrefs(
  modules: ModuleDef[],
  household: NavItemPref[] | null,
  personal: NavItemPref[] | null
): ModuleDef[] {
  return arrange(arrange(modules, household), personal);
}

function arrange(modules: ModuleDef[], prefs: NavItemPref[] | null): ModuleDef[] {
  if (!prefs || prefs.length === 0) return modules;
  const pos = new Map(prefs.map((p, i) => [p.slug, i]));
  const hidden = new Set(prefs.filter((p) => p.hidden).map((p) => p.slug));
  return modules
    .filter((m) => !hidden.has(m.slug))
    .slice()
    .sort((a, b) => (pos.get(a.slug) ?? 999) - (pos.get(b.slug) ?? 999));
}

export async function getNavPrefs(
  client: SupabaseClient,
  householdId: string,
  userId: string
): Promise<{ household: NavItemPref[] | null; personal: NavItemPref[] | null }> {
  const { data } = await client
    .from("nav_prefs")
    .select("user_id, layout")
    .eq("household_id", householdId)
    .or(`user_id.is.null,user_id.eq.${userId}`);
  let household: NavItemPref[] | null = null;
  let personal: NavItemPref[] | null = null;
  for (const row of data ?? []) {
    const layout = Array.isArray(row.layout) ? (row.layout as NavItemPref[]) : null;
    if (row.user_id === null) household = layout;
    else personal = layout;
  }
  return { household, personal };
}
