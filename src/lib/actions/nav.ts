"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/household";
import { getModule } from "@/lib/modules";
import type { NavItemPref } from "@/lib/nav";

export type NavScope = "household" | "mine";

/** Save an arranged menu. Household scope is owner-only (also enforced by RLS). */
export async function saveNavPrefs(
  scope: NavScope,
  layout: NavItemPref[]
): Promise<{ ok: boolean; error?: string }> {
  const membership = await getMembership();
  if (!membership) return { ok: false, error: "Not signed in" };
  if (scope === "household" && membership.role !== "owner")
    return { ok: false, error: "Only the household owner can change the family menu" };

  const clean = (Array.isArray(layout) ? layout : [])
    .filter((i) => i && typeof i.slug === "string" && getModule(i.slug))
    .slice(0, 50)
    .map((i) => ({ slug: i.slug, hidden: Boolean(i.hidden) }));

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const row = {
    household_id: membership.household_id,
    user_id: scope === "mine" ? user!.id : null,
    layout: clean,
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
