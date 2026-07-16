"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMembership } from "@/lib/household";
import { getPlatformAdmin } from "@/lib/admin";
import { parseLayout, type NavLayout } from "@/lib/nav-catalog";

export type NavScope = "household" | "mine" | "global";

/**
 * Save an arranged menu tree (menus, sub-menus, order, show/hide).
 * - "mine": the member's own row in nav_prefs.
 * - "household": the family default row (owner-only, also enforced by RLS).
 * - "global": the platform-wide default every household starts from — platform
 *   admin only, stored in platform_settings under key 'nav_default' (RLS allows
 *   authenticated SELECT; writes go through the service-role client here).
 * parseLayout validates everything: every slug must exist in MODULES,
 * duplicates and unknown junk are stripped, labels trimmed, sizes capped — the
 * layout can only arrange, never grant access (permissions apply on top at
 * render time).
 */
export async function saveNavPrefs(
  scope: NavScope,
  layout: NavLayout
): Promise<{ ok: boolean; error?: string }> {
  const clean = parseLayout(layout);
  if (!clean) return { ok: false, error: "Nothing to save" };

  if (scope === "global") {
    const admin = await getPlatformAdmin();
    if (!admin) return { ok: false, error: "Only the platform admin can change the global default menu" };
    const service = createAdminClient();
    const { error } = await service.from("platform_settings").upsert(
      { key: "nav_default", value: clean as unknown as object, updated_at: new Date().toISOString() },
      { onConflict: "key" }
    );
    if (error) return { ok: false, error: error.message };
    revalidatePath("/", "layout");
    return { ok: true };
  }

  const membership = await getMembership();
  if (!membership) return { ok: false, error: "Not signed in" };
  if (scope === "household" && membership.role !== "owner")
    return { ok: false, error: "Only the household owner can change the family menu" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const row = {
    household_id: membership.household_id,
    user_id: scope === "mine" ? user!.id : null,
    layout: clean as unknown as object,
    updated_at: new Date().toISOString(),
  };

  // partial unique indexes can't be used with upsert onConflict — do it manually
  const match = supabase
    .from("nav_prefs")
    .select("id")
    .eq("household_id", membership.household_id);
  const { data: existing } = await (scope === "mine"
    ? match.eq("user_id", user!.id)
    : match.is("user_id", null)
  ).maybeSingle();

  const { error } = existing
    ? await supabase.from("nav_prefs").update(row).eq("id", existing.id)
    : await supabase.from("nav_prefs").insert(row);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function resetNavPrefs(scope: NavScope): Promise<{ ok: boolean; error?: string }> {
  if (scope === "global") {
    const admin = await getPlatformAdmin();
    if (!admin) return { ok: false, error: "Only the platform admin can reset the global default menu" };
    const service = createAdminClient();
    const { error } = await service.from("platform_settings").delete().eq("key", "nav_default");
    if (error) return { ok: false, error: error.message };
    revalidatePath("/", "layout");
    return { ok: true };
  }

  const membership = await getMembership();
  if (!membership) return { ok: false, error: "Not signed in" };
  if (scope === "household" && membership.role !== "owner")
    return { ok: false, error: "Only the household owner can reset the family menu" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const del = supabase.from("nav_prefs").delete().eq("household_id", membership.household_id);
  const { error } = await (scope === "mine" ? del.eq("user_id", user!.id) : del.is("user_id", null));
  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  return { ok: true };
}
