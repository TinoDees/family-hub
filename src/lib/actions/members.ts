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

const KID_DOMAIN = "kids.nestly.internal";

/** Create a child account with username + password — no email needed. */
export async function createChildAccount(formData: FormData) {
  const membership = await requireOwner();
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
    redirect("/settings/members?error=Needs+SUPABASE_SERVICE_ROLE_KEY");

  const name = String(formData.get("name") ?? "").trim();
  const username = String(formData.get("username") ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "");
  const password = String(formData.get("password") ?? "");
  if (!name || username.length < 3)
    redirect("/settings/members?error=Name+and+a+username+of+3%2B+letters+required");
  if (password.length < 6)
    redirect("/settings/members?error=Password+needs+at+least+6+characters");

  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();
  const { data: created, error } = await admin.auth.admin.createUser({
    email: `${username}@${KID_DOMAIN}`,
    password,
    email_confirm: true,
    user_metadata: { display_name: name, is_child_account: true },
  });
  if (error || !created.user) {
    const msg = /already/i.test(error?.message ?? "")
      ? "That username is taken — pick another"
      : (error?.message ?? "Could not create the account");
    redirect(`/settings/members?error=${encodeURIComponent(msg)}`);
  }

  const { error: memberErr } = await admin.from("household_members").insert({
    household_id: membership.household_id,
    user_id: created.user.id,
    role: "child",
    display_name: name,
  });
  if (memberErr) {
    await admin.auth.admin.deleteUser(created.user.id); // don't leave an orphan account
    redirect(`/settings/members?error=${encodeURIComponent(memberErr.message)}`);
  }

  revalidatePath("/settings/members");
  redirect(`/settings/members?saved=${encodeURIComponent(`${name} can now sign in with username "${username}" and the password you set`)}`);
}
