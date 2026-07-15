"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMembership } from "@/lib/household";

const NO_KEY_MSG =
  "Admin operations need the SUPABASE_SERVICE_ROLE_KEY environment variable (Supabase dashboard → Project Settings → API Keys)";

function hasServiceKey() {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

async function requireOwnerAndTarget(userId: string, back: string, ownerOnly = false) {
  const membership = await getMembership();
  if (!membership) redirect("/dashboard");
  const supabase = await createClient();
  if (membership.role !== "owner") {
    if (ownerOnly)
      redirect(`${back}?error=${encodeURIComponent("Only the household owner can do this")}`);
    const { data: canManage } = await supabase.rpc("can_manage_people", {
      hid: membership.household_id,
    });
    if (!canManage) redirect("/dashboard");
  }
  let { data: target } = await supabase
    .from("household_members")
    .select("user_id, role")
    .eq("household_id", membership.household_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!target) {
    // Not a family member — allow managing guests of this household's trips
    const { data: guest } = await supabase
      .from("trip_participants")
      .select("user_id, trips!inner(household_id)")
      .eq("user_id", userId)
      .eq("trips.household_id", membership.household_id)
      .limit(1)
      .maybeSingle();
    if (guest) target = { user_id: userId, role: "guest" };
  }
  if (!target) redirect(`${back}?error=${encodeURIComponent("Not a member or trip guest of this household")}`);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // iron rule: nobody manages an owner's account but that owner themself
  if (target!.role === "owner" && user!.id !== userId)
    redirect(`${back}?error=${encodeURIComponent("Only the owner can manage their own account")}`);
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
  const { membership, selfId } = await requireOwnerAndTarget(userId, back, true); // deleting is the owner's alone
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

/** Tracey-style reset: temp password + emailed sign-in link → set-password page. */
export async function adminSendReset(formData: FormData) {
  const userId = String(formData.get("user_id"));
  const back = `/settings/members/${userId}`;
  if (!hasServiceKey()) redirect(`${back}?error=${encodeURIComponent(NO_KEY_MSG)}`);
  await requireOwnerAndTarget(userId, back);

  const admin = createAdminClient();
  const { data: acc } = await admin.auth.admin.getUserById(userId);
  const email = acc?.user?.email;
  if (!email) redirect(`${back}?error=${encodeURIComponent("No email on this account")}`);
  if (email!.endsWith("@kids.nestly.internal"))
    redirect(
      `${back}?error=${encodeURIComponent("Child accounts sign in with a username — use Set password instead and tell them the new one")}`
    );

  const rand = () => Math.random().toString(36).slice(2, 6);
  const temp = `Nestly-${rand()}-${rand()}`;
  const { error } = await admin.auth.admin.updateUserById(userId, {
    password: temp,
    user_metadata: { force_password_change: true },
  });
  if (error) redirect(`${back}?error=${encodeURIComponent(error.message)}`);

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "nestlyapp.co";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const loginUrl = `${proto}://${host}/auth/temp?email=${encodeURIComponent(email!)}&tmp=${encodeURIComponent(temp)}`;

  const name =
    acc?.user?.user_metadata?.display_name ?? email!.split("@")[0];
  const { sendLoginLinkEmail } = await import("@/lib/email");
  const result = await sendLoginLinkEmail({ to: email!, name, loginUrl });
  redirect(
    result.sent
      ? `${back}?saved=${encodeURIComponent("Reset email sent — their old password no longer works")}`
      : `${back}?error=${encodeURIComponent(`Email failed (${result.reason}) — you can still set a password manually below`)}`
  );
}
