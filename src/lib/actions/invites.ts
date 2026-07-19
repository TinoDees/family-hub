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

/** Normalise a phone number for wa.me / sms: links (AU default country code). */
function normalizePhone(raw: string): string | null {
  const s = raw.replace(/[^\d+]/g, "");
  if (!s) return null;
  let digits = s;
  if (digits.startsWith("+")) digits = digits.slice(1);
  else if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.startsWith("0")) digits = "61" + digits.slice(1);
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

async function requireInviteManager(errBack: string) {
  const membership = await getMembership();
  if (!membership) redirect(errBack);
  if (membership.role !== "owner") {
    const supabase = await createClient();
    const { data: canManage } = await supabase.rpc("can_manage_people", {
      hid: membership.household_id,
    });
    if (!canManage) redirect(errBack);
  }
  return membership;
}

export async function createInvite(formData: FormData) {
  const membership = await requireInviteManager(
    "/settings/invites?error=You+do+not+have+permission+to+invite+members"
  );

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phoneRaw = String(formData.get("phone") ?? "").trim();
  const role = String(formData.get("role") ?? "adult") as MemberRole;

  if (!email && !phoneRaw)
    redirect("/settings/invites?error=Enter+an+email+or+a+mobile+number");
  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
  if (phoneRaw && !phone)
    redirect("/settings/invites?error=That+mobile+number+doesn%27t+look+right");

  const supabase = await createClient();
  // one live invite per contact — replace any previous unaccepted invite
  if (email) {
    await supabase
      .from("invites")
      .delete()
      .eq("household_id", membership.household_id)
      .eq("email", email)
      .is("accepted_at", null);
  }
  if (phone) {
    await supabase
      .from("invites")
      .delete()
      .eq("household_id", membership.household_id)
      .eq("phone", phone)
      .is("accepted_at", null);
  }

  const { data, error } = await supabase
    .from("invites")
    .insert({
      household_id: membership.household_id,
      email: email || null,
      phone,
      role,
    })
    .select("token")
    .single();
  if (error || !data)
    redirect(
      `/settings/invites?error=${encodeURIComponent(error?.message ?? "Could not create invite")}`
    );

  let emailed = false;
  if (email) {
    const inviteUrl = `${await baseUrl()}/invite/${data.token}`;
    const result = await sendInviteEmail({
      to: email,
      householdName: membership.household.name,
      inviterName: membership.display_name ?? "A family member",
      role,
      inviteUrl,
    });
    emailed = result.sent;
  }

  revalidatePath("/settings/invites");
  redirect(
    `/settings/invites?created=1&emailed=${emailed ? 1 : 0}${!email ? `&share=${data.token}` : ""}`
  );
}

export async function resendInvite(formData: FormData) {
  const membership = await requireInviteManager("/dashboard");

  const supabase = await createClient();
  const { data: old } = await supabase
    .from("invites")
    .select("id, email, phone, role, accepted_at, revoked_at, expires_at")
    .eq("id", String(formData.get("invite_id")))
    .eq("household_id", membership.household_id)
    .maybeSingle();
  if (!old) redirect("/settings/invites?error=Invite+not+found");

  // one live invite per contact — remove all previous unaccepted invites
  if (old.email) {
    await supabase
      .from("invites")
      .delete()
      .eq("household_id", membership.household_id)
      .eq("email", old.email)
      .is("accepted_at", null);
  } else {
    await supabase
      .from("invites")
      .delete()
      .eq("id", old.id)
      .is("accepted_at", null);
  }

  const { data, error } = await supabase
    .from("invites")
    .insert({
      household_id: membership.household_id,
      email: old.email,
      phone: old.phone,
      role: old.role,
    })
    .select("token")
    .single();
  if (error || !data)
    redirect(`/settings/invites?error=${encodeURIComponent(error?.message ?? "Could not create invite")}`);

  let emailed = false;
  if (old.email) {
    const inviteUrl = `${await baseUrl()}/invite/${data.token}`;
    const result = await sendInviteEmail({
      to: old.email,
      householdName: membership.household.name,
      inviterName: membership.display_name ?? "A family member",
      role: old.role,
      inviteUrl,
    });
    emailed = result.sent;
  }

  revalidatePath("/settings/invites");
  redirect(
    `/settings/invites?created=1&emailed=${emailed ? 1 : 0}${!old.email ? `&share=${data.token}` : ""}`
  );
}

export async function deleteInvite(formData: FormData) {
  const membership = await requireInviteManager("/dashboard");

  const supabase = await createClient();
  await supabase
    .from("invites")
    .delete()
    .eq("id", String(formData.get("invite_id")))
    .eq("household_id", membership.household_id);

  revalidatePath("/settings/invites");
  redirect("/settings/invites");
}

/**
 * Tracey-style onboarding: the invite link doubles as account setup.
 * Email invites carry the address; phone/link invites ask the person for
 * their own email here (the invite itself stays channel-agnostic).
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

  const email = (invite.email ?? String(formData.get("email") ?? ""))
    .trim()
    .toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    fail("Please enter a valid email address");

  const { data, error: signUpError } = await supabase.auth.signUp({
    email,
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
  redirect("/setup-device");
}

export async function signOutToInvite(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(`/invite/${token}`);
}

export async function acceptInvite(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_invite", { p_token: token });
  if (error)
    redirect(`/invite/${token}?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/", "layout");
  redirect("/setup-device");
}
