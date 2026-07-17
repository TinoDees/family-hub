"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/household";

/** Create (or replace) the member's personal iPhone-sharing key. */
export async function createShareToken() {
  const membership = await getMembership();
  if (!membership) redirect("/onboarding");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // one key per member keeps it simple — replacing invalidates the old one
  await supabase.from("share_tokens").delete().eq("user_id", user.id);
  const token = randomBytes(24).toString("base64url");
  await supabase.from("share_tokens").insert({
    household_id: membership.household_id,
    user_id: user.id,
    token,
    label: "iPhone",
  });
  revalidatePath("/account/iphone-sharing");
}

export async function deleteShareToken() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  await supabase.from("share_tokens").delete().eq("user_id", user.id);
  revalidatePath("/account/iphone-sharing");
}
