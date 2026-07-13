"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/module-guard";

export async function addEvent(formData: FormData) {
  const { membership, userId } = await requireModule("planner", "edit");
  const title = String(formData.get("title") ?? "").trim();
  const back = `/planner?view=${formData.get("view") ?? "week"}&d=${formData.get("d") ?? ""}`;
  if (!title) redirect(`${back}&error=Event+needs+a+title`);

  const supabase = await createClient();
  const recurring = formData.get("recurring") === "on";
  const { error } = await supabase.from("planner_events").insert({
    household_id: membership.household_id,
    title,
    event_date: String(formData.get("event_date")),
    start_time: String(formData.get("start_time") || "") || null,
    end_time: String(formData.get("end_time") || "") || null,
    location: String(formData.get("location") ?? "").trim() || null,
    assigned: formData.getAll("assigned").map(String),
    recurrence: recurring ? "weekly" : null,
    recurrence_until: recurring ? String(formData.get("recurrence_until") || "") || null : null,
    created_by: userId,
  });
  if (error) redirect(`${back}&error=${encodeURIComponent(error.message)}`);
  revalidatePath("/planner");
  redirect(back);
}

export async function deleteEvent(formData: FormData) {
  const { membership } = await requireModule("planner", "edit");
  const supabase = await createClient();
  await supabase
    .from("planner_events")
    .delete()
    .eq("id", String(formData.get("event_id")))
    .eq("household_id", membership.household_id);
  revalidatePath("/planner");
  redirect(`/planner?view=${formData.get("view") ?? "week"}&d=${formData.get("d") ?? ""}`);
}
