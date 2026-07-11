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

export async function acceptInvite(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_invite", { p_token: token });
  if (error)
    redirect(`/invite/${token}?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/", "layout");
  redirect("/dashboard");
}
