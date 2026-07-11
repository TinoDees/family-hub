"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/household";
import { MODULES, type Access, type MemberRole } from "@/lib/modules";

async function requireOwner() {
  const membership = await getMembership();
  if (!membership || membership.role !== "owner")
    redirect("/dashboard");
  return membership;
}

export async function setMemberRole(formData: FormData) {
  const membership = await requireOwner();
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_member_role", {
    p_household: membership.household_id,
    p_user: String(formData.get("user_id")),
    p_role: String(formData.get("role")) as MemberRole,
  });
  revalidatePath("/settings/members");
  redirect(
    error
      ? `/settings/members?error=${encodeURIComponent(error.message)}`
      : "/settings/members?saved=1"
  );
}

export async function removeMember(formData: FormData) {
  const membership = await requireOwner();
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_member", {
    p_household: membership.household_id,
    p_user: String(formData.get("user_id")),
  });
  revalidatePath("/settings/members");
  redirect(
    error
      ? `/settings/members?error=${encodeURIComponent(error.message)}`
      : "/settings/members?saved=1"
  );
}

/**
 * Save the permission matrix for one member.
 * Stores overrides only where they differ from the member's role default;
 * removes rows that match the default again (so future default changes apply).
 */
export async function savePermissions(
  targetUserId: string,
  targetRole: MemberRole,
  entries: Record<string, Access>
): Promise<{ ok: boolean; error?: string }> {
  const membership = await getMembership();
  if (!membership || membership.role !== "owner")
    return { ok: false, error: "Only the owner can change permissions" };

  const supabase = await createClient();
  const toUpsert: {
    household_id: string;
    user_id: string;
    module_slug: string;
    access: Access;
    updated_by: string | null;
  }[] = [];
  const toDelete: string[] = [];

  const {
    data: { user },
  } = await supabase.auth.getUser();

  for (const m of MODULES) {
    const chosen = entries[m.slug];
    if (!chosen) continue;
    if (chosen === m.defaults[targetRole]) {
      toDelete.push(m.slug);
    } else {
      toUpsert.push({
        household_id: membership.household_id,
        user_id: targetUserId,
        module_slug: m.slug,
        access: chosen,
        updated_by: user?.id ?? null,
      });
    }
  }

  if (toUpsert.length > 0) {
    const { error } = await supabase
      .from("module_permissions")
      .upsert(toUpsert, { onConflict: "household_id,user_id,module_slug" });
    if (error) return { ok: false, error: error.message };
  }
  if (toDelete.length > 0) {
    const { error } = await supabase
      .from("module_permissions")
      .delete()
      .eq("household_id", membership.household_id)
      .eq("user_id", targetUserId)
      .in("module_slug", toDelete);
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function resetPermissions(formData: FormData) {
  const membership = await requireOwner();
  const supabase = await createClient();
  await supabase
    .from("module_permissions")
    .delete()
    .eq("household_id", membership.household_id)
    .eq("user_id", String(formData.get("user_id")));
  revalidatePath("/", "layout");
  redirect(`/settings/members/${formData.get("user_id")}?saved=1`);
}
