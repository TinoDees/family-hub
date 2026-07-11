"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMembership } from "@/lib/household";

const NO_KEY_MSG =
  "Admin operations need the SUPABASE_SERVICE_ROLE_KEY environment variable (Supabase dashboard → Project Settings → API Keys)";

function hasServiceKey() {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

async function requireOwnerAndTarget(userId: string, back: string) {
  const membership = await getMembership();
  if (!membership || membership.role !== "owner") redirect("/dashboard");
  const supabase = await createClient();
  const { data: target } = await supabase
    .from("household_members")
    .select("user_id, role")
    .eq("household_id", membership.household_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!target) redirect(`${back}?error=${encodeURIComponent("Not a member of this household")}`);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { membership, target: target!, selfId: user!.id };
}

export async function adminSetPassword(formData: FormData) {
  const userId = String(formData.get("user_id"));
  const back = `/settings/members/${userId}`;
  if (!hasServiceKey()) redirect(`${back}?error=${encodeURIComponent(NO_KEY_MSG)}`);
  await requireOwnerAndTarget(userId, back);

  const password = String(formData.get("password") ?? "");
  if (password.length < 8)
    redirect(`${back}?error=${encodeURIComponent("Password must be at least 8 characters")}`);

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, { password });
  redirect(
    error
      ? `${back}?error=${encodeURIComponent(error.message)}`
      : `${back}?saved=${encodeURIComponent("Password updated — share it with them; they can change it later")}`
  );
}

export async function adminSetBlocked(formData: FormData) {
  const userId = String(formData.get("user_id"));
  const block = String(formData.get("block")) === "1";
  const back = `/settings/members/${userId}`;
  if (!hasServiceKey()) redirect(`${back}?error=${encodeURIComponent(NO_KEY_MSG)}`);
  const { selfId } = await requireOwnerAndTarget(userId, back);
  if (userId === selfId)
    redirect(`${back}?error=${encodeURIComponent("You cannot block yourself")}`);

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: block ? "87600h" : "none", // ~10 years | lift ban
  });
  revalidatePath(back);
  redirect(
    error
      ? `${back}?error=${encodeURIComponent(error.message)}`
      : `${back}?saved=${encodeURIComponent(block ? "Member blocked — they can no longer sign in" : "Member unblocked")}`
  );
}

export async function adminDeleteUser(formData: FormData) {
  const userId = String(formData.get("user_id"));
  const back = `/settings/members/${userId}`;
  if (!hasServiceKey()) redirect(`${back}?error=${encodeURIComponent(NO_KEY_MSG)}`);
  const { membership, selfId } = await requireOwnerAndTarget(userId, back);
  if (userId === selfId)
    redirect(`${back}?error=${encodeURIComponent("You cannot delete your own account here")}`);

  // remove from household first (RPC guards last-owner), then delete the auth account
  const supabase = await createClient();
  const { error: removeError } = await supabase.rpc("remove_member", {
    p_household: membership.household_id,
    p_user: userId,
  });
  if (removeError) redirect(`${back}?error=${encodeURIComponent(removeError.message)}`);

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(userId);
  revalidatePath("/settings/members");
  redirect(
    error
      ? `/settings/members?error=${encodeURIComponent(error.message)}`
      : `/settings/members?saved=${encodeURIComponent("Account deleted")}`
  );
}

/** Server-side read of auth account info for the member detail page. */
export async function getAccountInfo(userId: string): Promise<{
  available: boolean;
  email?: string;
  blocked?: boolean;
  lastSignIn?: string | null;
}> {
  if (!hasServiceKey()) return { available: false };
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data.user) return { available: false };
  const u = data.user as typeof data.user & { banned_until?: string };
  return {
    available: true,
    email: u.email,
    blocked: Boolean(u.banned_until && new Date(u.banned_until) > new Date()),
    lastSignIn: u.last_sign_in_at ?? null,
  };
}
