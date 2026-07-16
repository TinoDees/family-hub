"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getPlatformAdmin } from "@/lib/admin";
import { runHealthCheck } from "@/lib/health";

export async function runHealthCheckNow() {
  const admin = await getPlatformAdmin();
  if (!admin) redirect("/dashboard");
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
    redirect(
      `/admin/health?error=${encodeURIComponent("SUPABASE_SERVICE_ROLE_KEY is not configured")}`
    );

  await runHealthCheck("manual");
  revalidatePath("/admin/health");
  redirect("/admin/health");
}
