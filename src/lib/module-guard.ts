import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMembership, type Membership } from "@/lib/household";
import { getPermissions, accessFor, canAtLeast } from "@/lib/permissions";
import type { Access } from "@/lib/modules";

export type ModuleContext = {
  membership: Membership;
  access: Access;
  userId: string;
};

/** Generic guard for module pages/actions. Redirects when below `min`. */
export async function requireModule(
  slug: string,
  min: Access = "view"
): Promise<ModuleContext> {
  const membership = await getMembership();
  if (!membership) redirect("/onboarding");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const perms = await getPermissions(membership.household_id, user!.id, membership.role);
  const access = accessFor(perms, slug);
  if (!canAtLeast(access, min)) redirect("/dashboard");
  return { membership, access, userId: user!.id };
}
