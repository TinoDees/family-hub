import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import {
  MODULES,
  ACCESS_RANK,
  type Access,
  type MemberRole,
  type ModuleDef,
} from "@/lib/modules";

export type ModuleAccess = {
  module: ModuleDef;
  access: Access;
  /** true when an explicit override row exists (vs role default) */
  overridden: boolean;
};

/**
 * The single permission resolver — used by the sidebar, the dashboard grid,
 * the module route guard and the settings matrix, so they always agree.
 */
export const getPermissions = cache(async (
  householdId: string,
  userId: string,
  role: MemberRole
): Promise<ModuleAccess[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("module_permissions")
    .select("module_slug, access")
    .eq("household_id", householdId)
    .eq("user_id", userId);

  const overrides = new Map(
    (data ?? []).map((r) => [r.module_slug as string, r.access as Access])
  );

  return MODULES.map((m) => ({
    module: m,
    access: overrides.get(m.slug) ?? m.defaults[role],
    overridden: overrides.has(m.slug),
  }));
});

export function visibleModules(perms: ModuleAccess[]): ModuleAccess[] {
  return perms.filter((p) => p.access !== "none");
}

export function accessFor(perms: ModuleAccess[], slug: string): Access {
  return perms.find((p) => p.module.slug === slug)?.access ?? "none";
}

export function canAtLeast(access: Access, required: Access): boolean {
  return ACCESS_RANK[access] >= ACCESS_RANK[required];
}
