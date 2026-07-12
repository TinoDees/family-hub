"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/module-guard";

function enc(s: string) {
  return encodeURIComponent(s);
}

export async function createTrip(formData: FormData) {
  const { membership, userId } = await requireModule("holidays", "edit");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) redirect("/holidays?error=Trip+needs+a+name");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("trips")
    .insert({
      household_id: membership.household_id,
      name,
      destination: String(formData.get("destination") ?? "").trim() || null,
      start_date: String(formData.get("start_date") || "") || null,
      end_date: String(formData.get("end_date") || "") || null,
      created_by: userId,
    })
    .select("id")
    .single();
  if (error || !data) redirect(`/holidays?error=${enc(error?.message ?? "Could not create trip")}`);

  // creator joins automatically as first participant
  await supabase.from("trip_participants").insert({
    trip_id: data.id,
    household_id: membership.household_id,
    user_id: userId,
    name: membership.display_name ?? "Me",
  });
  redirect(`/holidays/${data.id}`);
}

export async function deleteTrip(formData: FormData) {
  const { membership } = await requireModule("holidays", "edit");
  const supabase = await createClient();
  await supabase
    .from("trips")
    .delete()
    .eq("id", String(formData.get("trip_id")))
    .eq("household_id", membership.household_id);
  revalidatePath("/holidays");
  redirect("/holidays");
}

export async function setTripStatus(formData: FormData) {
  const { membership } = await requireModule("holidays", "edit");
  const tripId = String(formData.get("trip_id"));
  const supabase = await createClient();
  await supabase
    .from("trips")
    .update({ status: String(formData.get("status")) })
    .eq("id", tripId)
    .eq("household_id", membership.household_id);
  revalidatePath(`/holidays/${tripId}`);
  redirect(`/holidays/${tripId}`);
}

export async function addParticipant(formData: FormData) {
  const { membership } = await requireModule("holidays", "edit");
  const tripId = String(formData.get("trip_id"));
  const name = String(formData.get("name") ?? "").trim();
  if (!name) redirect(`/holidays/${tripId}?error=Participant+needs+a+name`);

  const supabase = await createClient();
  await supabase.from("trip_participants").insert({
    trip_id: tripId,
    household_id: membership.household_id,
    user_id: String(formData.get("user_id") || "") || null,
    name,
  });
  revalidatePath(`/holidays/${tripId}`);
  redirect(`/holidays/${tripId}`);
}

export async function removeParticipant(formData: FormData) {
  const { membership } = await requireModule("holidays", "edit");
  const tripId = String(formData.get("trip_id"));
  const participantId = String(formData.get("participant_id"));

  const supabase = await createClient();
  // block removal when they have money attached
  const [{ count: paid }, { count: shares }] = await Promise.all([
    supabase
      .from("trip_expenses")
      .select("id", { count: "exact", head: true })
      .eq("paid_by", participantId),
    supabase
      .from("trip_expense_shares")
      .select("expense_id", { count: "exact", head: true })
      .eq("participant_id", participantId),
  ]);
  if ((paid ?? 0) > 0 || (shares ?? 0) > 0)
    redirect(`/holidays/${tripId}?error=${enc("They have expenses attached — delete those first")}`);

  await supabase
    .from("trip_participants")
    .delete()
    .eq("id", participantId)
    .eq("household_id", membership.household_id);
  revalidatePath(`/holidays/${tripId}`);
  redirect(`/holidays/${tripId}`);
}

export async function addExpense(formData: FormData) {
  const { membership, userId } = await requireModule("holidays", "edit");
  const tripId = String(formData.get("trip_id"));
  const amount = Math.round(parseFloat(String(formData.get("amount") ?? "0")) * 100) / 100;
  const description = String(formData.get("description") ?? "").trim();
  const paidBy = String(formData.get("paid_by") ?? "");
  const sharedWith = formData.getAll("shared_with").map(String);

  const back = `/holidays/${tripId}`;
  if (!description) redirect(`${back}?error=Expense+needs+a+description`);
  if (!amount || amount <= 0) redirect(`${back}?error=Amount+must+be+positive`);
  if (!paidBy) redirect(`${back}?error=Pick+who+paid`);
  if (sharedWith.length === 0) redirect(`${back}?error=Pick+who+shares+the+cost`);

  const supabase = await createClient();
  const { data: expense, error } = await supabase
    .from("trip_expenses")
    .insert({
      trip_id: tripId,
      household_id: membership.household_id,
      description,
      amount,
      currency: membership.household.base_currency,
      spent_at: String(formData.get("spent_at") || "") || new Date().toISOString().slice(0, 10),
      paid_by: paidBy,
      created_by: userId,
    })
    .select("id")
    .single();
  if (error || !expense) redirect(`${back}?error=${enc(error?.message ?? "Could not save")}`);

  // equal split, cents distributed so the sum matches exactly
  const cents = Math.round(amount * 100);
  const base = Math.floor(cents / sharedWith.length);
  const remainder = cents - base * sharedWith.length;
  const shares = sharedWith.map((pid, i) => ({
    expense_id: expense.id,
    participant_id: pid,
    amount: (base + (i < remainder ? 1 : 0)) / 100,
  }));
  const { error: shareErr } = await supabase.from("trip_expense_shares").insert(shares);
  if (shareErr) {
    await supabase.from("trip_expenses").delete().eq("id", expense.id);
    redirect(`${back}?error=${enc(shareErr.message)}`);
  }
  revalidatePath(back);
  redirect(back);
}

export async function deleteExpense(formData: FormData) {
  const { membership } = await requireModule("holidays", "edit");
  const tripId = String(formData.get("trip_id"));
  const supabase = await createClient();
  await supabase
    .from("trip_expenses")
    .delete()
    .eq("id", String(formData.get("expense_id")))
    .eq("household_id", membership.household_id);
  revalidatePath(`/holidays/${tripId}`);
  redirect(`/holidays/${tripId}`);
}
