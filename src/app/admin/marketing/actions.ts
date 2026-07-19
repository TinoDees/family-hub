"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getPlatformAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";

function slugify(v: string) {
  return v
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export async function createCampaign(formData: FormData) {
  const admin = await getPlatformAdmin();
  if (!admin) redirect("/dashboard");

  const name = String(formData.get("name") ?? "").trim();
  if (!name) redirect("/admin/marketing?error=Name+is+required");

  const utmSource = slugify(String(formData.get("utm_source") ?? "")) || "other";
  const utmCampaign =
    slugify(String(formData.get("utm_campaign") ?? "")) || slugify(name);

  const db = createAdminClient();
  const { error } = await db.from("marketing_campaigns").insert({
    name,
    channel: String(formData.get("channel") ?? "other"),
    utm_source: utmSource,
    utm_medium: slugify(String(formData.get("utm_medium") ?? "")) || null,
    utm_campaign: utmCampaign,
    monthly_budget: Number(formData.get("monthly_budget")) || null,
    notes: String(formData.get("notes") ?? "").slice(0, 500) || null,
  });
  if (error) redirect(`/admin/marketing?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/admin/marketing");
  redirect("/admin/marketing?message=Campaign+created");
}

export async function toggleCampaign(formData: FormData) {
  const admin = await getPlatformAdmin();
  if (!admin) redirect("/dashboard");
  const id = String(formData.get("id") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  const db = createAdminClient();
  await db.from("marketing_campaigns").update({ active: !active }).eq("id", id);
  revalidatePath("/admin/marketing");
  redirect("/admin/marketing");
}

export async function deleteCampaign(formData: FormData) {
  const admin = await getPlatformAdmin();
  if (!admin) redirect("/dashboard");
  const id = String(formData.get("id") ?? "");
  const db = createAdminClient();
  await db.from("marketing_campaigns").delete().eq("id", id);
  revalidatePath("/admin/marketing");
  redirect("/admin/marketing?message=Campaign+deleted");
}
