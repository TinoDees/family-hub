"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createHousehold(formData: FormData) {
  const supabase = await createClient();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) redirect("/onboarding?error=Please+give+your+household+a+name");

  const { error } = await supabase.rpc("create_household", { p_name: name });
  if (error) redirect(`/onboarding?error=${encodeURIComponent(error.message)}`);

  revalidatePath("/", "layout");
  redirect("/setup-device");
}

export async function joinHousehold(formData: FormData) {
  const supabase = await createClient();
  const code = String(formData.get("code") ?? "").trim().toLowerCase();
  if (!code) redirect("/onboarding?error=Please+enter+an+invite+code");

  const { data, error } = await supabase.rpc("join_household_by_code", {
    p_code: code,
  });
  if (error || !data)
    redirect(
      `/onboarding?error=${encodeURIComponent(error?.message ?? "Invalid invite code")}`
    );

  revalidatePath("/", "layout");
  redirect("/setup-device");
}
