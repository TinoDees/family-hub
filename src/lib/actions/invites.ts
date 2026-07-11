"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/household";
import { sendInviteEmail } from "@/lib/email";
import type { MemberRole } from "@/lib/modules";

async function baseUrl() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

export async function createInvite(formData: FormData) {
  const membership = await getMembership();
  if (!membership || membership.role !== "owner")
    redirect("/settings/invites?error=Only+the+owner+can+invite+members");

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "adult") as MemberRole;
  if (!email) redirect("/settings/invites?error=Please+enter+an+email");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invites")
    .insert({
      household_id: membership.household_id,
      email,
      role,
    })
    .select("token")
    .single();
  if (error || !data)
    redirect(
      `/settings/invites?error=${encodeURIComponent(error?.message ?? "Could not create invite")}`
    );

  const inviteUrl = `${await baseUrl()}/invite/${data.token}`;
  const result = await sendInviteEmail({
    to: email,
    householdName: membership.household.name,
    inviterName: membership.display_name ?? "A family member",
    role,
    inviteUrl,
  });

  revalidatePath("/settings/invites");
  redirect(`/settings/invites?created=1&emailed=${result.sent ? 1 : 0}`);
}

export async function resendInvite(formData: FormData) {
  const membership = await getMembership();
  if (!membership || membership.role !== "owner") redirect("/dashboard");

  const supabase = await createClient();
  const { data: old } = await supabase
    .from("invites")
    .select("id, email, role, accepted_at, revoked_at, expires_at")
    .eq("id", String(formData.get("invite_id")))
    .eq("household_id", membership.household_id)
    .maybeSingle();
  if (!old) redirect("/settings/invites?error=Invite+not+found");

  // retire the old one if it is still pending
  if (!old.accepted_at && !old.revoked_at && new Date(old.expires_at) > new Date()) {
    await supabase
      .from("invites")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", old.id);
  }

  const { data, error } = await supabase
    .from("invites")
    .insert({ household_id: membership.household_id, email: old.email, role: old.role })
    .select("token")
    .single();
  if (error || !data)
    redirect(`/settings/invites?error=${encodeURIComponent(error?.message ?? "Could not create invite")}`);

  const inviteUrl = `${await baseUrl()}/invite/${data.token}`;
  const result = await sendInviteEmail({
    to: old.email,
    householdName: membership.household.name,
    inviterName: membership.display_name ?? "A family member",
    role: old.role,
    inviteUrl,
  });

  revalidatePath("/settings/invites");
  redirect(`/settings/invites?created=1&emailed=${result.sent ? 1 : 0}`);
}

export async function revokeInvite(formData: FormData) {
  const membership = await getMembership();
  if (!membership || membership.role !== "owner") redirect("/dashboard");

  const supabase = await createClient();
  await supabase
    .from("invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", String(formData.get("invite_id")))
    .eq("household_id", membership.household_id);

  revalidatePath("/settings/invites");
  redirect("/settings/invites");
}

/**
 * Tracey-style onboarding: the invite link doubles as account setup.
 * Creates the account with the invited email + chosen password, signs in,
 * and joins the household — one step, no separate signup form.
 */
export async function acceptInviteNewUser(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const fail = (msg: string) =>
    redirect(`/invite/${token}?error=${encodeURIComponent(msg)}`);

  if (!name) fail("Please enter your name");
  if (password.length < 8) fail("Password must be at least 8 characters");
  if (password !== confirm) fail("Passwords do not match");

  const supabase = await createClient();
  const { data: inviteRows } = await supabase.rpc("get_invite_by_token", {
    p_token: token,
  });
  const invite = inviteRows?.[0];
  if (!invite || invite.status !== "pending")
    fail("This invite is no longer valid");

  const { data, error: signUpError } = await supabase.auth.signUp({
    email: invite.email,
    password,
    options: { data: { display_name: name } },
  });
  if (signUpError) {
    if (/already registered/i.test(signUpError.message))
      fail("An account with this email already exists — use 'I already have an account' below");
    fail(signUpError.message);
  }
  if (!data.session) fail("Could not sign you in — please try again");

  const { error: acceptError } = await supabase.rpc("accept_invite", {
    p_token: token,
  });
  if (acceptError) fail(acceptError.message);

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function acceptInvite(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_invite", { p_token: token });
  if (error)
    redirect(`/invite/${token}?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/", "layout");
  redirect("/dashboard");
}
