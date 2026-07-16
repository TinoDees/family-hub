"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/household";

export async function updateHousehold(formData: FormData) {
  const membership = await getMembership();
  if (!membership || membership.role !== "owner")
    redirect("/settings?error=Only+the+owner+can+change+household+settings");

  const name = String(formData.get("name") ?? "").trim();
  const baseCurrency = String(formData.get("base_currency") ?? "AUD")
    .trim()
    .toUpperCase();
  if (!name) redirect("/settings?error=Household+name+cannot+be+empty");

  const retentionRaw = String(formData.get("receipt_retention_days") ?? "").trim();
  const retention = retentionRaw ? Math.max(1, parseInt(retentionRaw)) || null : null;

  const supabase = await createClient();
  const safety = String(formData.get("device_safety_service") ?? "");
  const { error } = await supabase
    .from("households")
    .update({
      name,
      base_currency: baseCurrency,
      receipt_retention_days: retention,
      device_safety_service: ["google", "apple", "life360"].includes(safety) ? safety : null,
    })
    .eq("id", membership.household_id);
  if (error) redirect(`/settings?error=${encodeURIComponent(error.message)}`);

  revalidatePath("/", "layout");
  redirect("/settings?saved=1");
}

export async function updateDeviceLock(formData: FormData) {
  const membership = await getMembership();
  if (!membership || membership.role !== "owner")
    redirect("/settings?error=Only+the+owner+can+change+device+lock+settings");

  const enabled = formData.get("idle_lock_enabled") === "on";
  const minutes = Math.min(240, Math.max(1, parseInt(String(formData.get("idle_lock_minutes") ?? "30")) || 30));
  const overnightRaw = String(formData.get("overnight_logout_at") ?? "").trim();
  const overnight = /^\d{2}:\d{2}$/.test(overnightRaw) ? overnightRaw : "00:00";
  const tzRaw = String(formData.get("timezone") ?? "").trim();
  let timezone = "Australia/Sydney";
  try {
    new Intl.DateTimeFormat("en", { timeZone: tzRaw });
    timezone = tzRaw || timezone;
  } catch {
    /* keep default */
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("households")
    .update({
      idle_lock_enabled: enabled,
      idle_lock_minutes: minutes,
      overnight_logout_at: overnight,
      timezone,
    })
    .eq("id", membership.household_id);
  if (error) redirect(`/settings?error=${encodeURIComponent(error.message)}`);

  revalidatePath("/", "layout");
  redirect("/settings?saved=1");
}
