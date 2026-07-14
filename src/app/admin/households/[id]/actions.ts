"use server";

import { revalidatePath } from "next/cache";
import { getPlatformAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { getModule } from "@/lib/modules";

/**
 * Toggle a module on/off for a household (platform-level kill switch).
 * Writes to household_module_flags via the service-role client, so we
 * re-check the caller is a platform admin first — never trust the client.
 */
export async function setModuleFlag(formData: FormData) {
  const admin = await getPlatformAdmin();
  if (!admin) throw new Error("Not authorised");

  const householdId = String(formData.get("household_id") ?? "");
  const moduleId = String(formData.get("module_id") ?? "");
  const enabled = String(formData.get("enabled")) === "true";

  if (!householdId || !getModule(moduleId)) {
    throw new Error("Invalid household or module");
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("household_module_flags").upsert({
    household_id: householdId,
    module_id: moduleId,
    enabled,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/admin/households/${householdId}`);
  revalidatePath("/admin/households");
}
