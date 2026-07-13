"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/** The signed-in user's own participant row for a trip (guests and members). */
async function myParticipant(tripId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("trip_participants")
    .select("id, name, household_id")
    .eq("trip_id", tripId)
    .eq("user_id", user.id)
    .maybeSingle();
  return data;
}

export async function acceptTripInvite(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_trip_invite", { p_token: token });
  if (error || !data)
    redirect(`/trip-invite/${token}?error=${encodeURIComponent(error?.message ?? "Could not join")}`);
  revalidatePath("/", "layout");
  redirect(`/guest/${data}`);
}

export async function addGuestExpense(formData: FormData) {
  const tripId = String(formData.get("trip_id"));
  const back = `/guest/${tripId}`;
  const me = await myParticipant(tripId);
  if (!me) redirect("/login");

  const amount = Math.round(parseFloat(String(formData.get("amount") ?? "0")) * 100) / 100;
  const description = String(formData.get("description") ?? "").trim();
  const sharedWith = formData.getAll("shared_with").map(String);
  if (!description) redirect(`${back}?error=Expense+needs+a+description`);
  if (!amount || amount <= 0) redirect(`${back}?error=Amount+must+be+positive`);
  if (sharedWith.length === 0) redirect(`${back}?error=Pick+who+shares+the+cost`);

  const supabase = await createClient();
  const { data: expense, error } = await supabase
    .from("trip_expenses")
    .insert({
      trip_id: tripId,
      household_id: me.household_id,
      description,
      amount,
      spent_at: String(formData.get("spent_at") || "") || new Date().toISOString().slice(0, 10),
      paid_by: me.id,
      receipt_photo_id: String(formData.get("receipt_photo_id") || "") || null,
      is_treat: formData.get("is_treat") === "on",
      original_amount: parseFloat(String(formData.get("original_amount") || "")) || null,
      original_currency: String(formData.get("original_currency") || "").trim().toUpperCase() || null,
    })
    .select("id")
    .single();
  if (error || !expense)
    redirect(`${back}?error=${encodeURIComponent(error?.message ?? "Could not save")}`);

  // shares: exact when items are allocated, else equal
  type ItemIn = { description: string; amount: number; consumed_by?: string | null };
  let items: ItemIn[] = [];
  try {
    items = JSON.parse(String(formData.get("items_json") || "[]"));
  } catch {}
  items = (Array.isArray(items) ? items : [])
    .filter((i) => i && i.description && typeof i.amount === "number")
    .slice(0, 100);

  const cents = Math.round(amount * 100);
  const perParticipant = new Map<string, number>();
  let allocatedCents = 0;
  if (formData.get("is_treat") === "on") {
    const { error: shareErr } = await supabase.from("trip_expense_shares").insert([
      { expense_id: expense.id, participant_id: me.id, amount },
    ]);
    if (shareErr) redirect(`${back}?error=${encodeURIComponent(shareErr.message)}`);
    if (items.length > 0) {
      await supabase.from("trip_expense_items").insert(
        items.map((i, idx) => ({
          expense_id: expense.id,
          position: idx,
          description: String(i.description).slice(0, 200),
          amount: Math.round(i.amount * 100) / 100,
        }))
      );
    }
    revalidatePath(back);
    redirect(back);
  }
  for (const i of items) {
    if (i.consumed_by) {
      const c = Math.round(i.amount * 100);
      perParticipant.set(i.consumed_by, (perParticipant.get(i.consumed_by) ?? 0) + c);
      allocatedCents += c;
    }
  }
  const poolCents = cents - allocatedCents;
  if (poolCents < 0) {
    await supabase.from("trip_expenses").delete().eq("id", expense.id);
    redirect(`${back}?error=${encodeURIComponent("Allocated items exceed the bill total")}`);
  }
  if (poolCents > 0) {
    const base = Math.floor(poolCents / sharedWith.length);
    const remainder = poolCents - base * sharedWith.length;
    sharedWith.forEach((pid, i) => {
      perParticipant.set(pid, (perParticipant.get(pid) ?? 0) + base + (i < remainder ? 1 : 0));
    });
  }
  const shares = [...perParticipant.entries()]
    .filter(([, c]) => c > 0)
    .map(([pid, c]) => ({ expense_id: expense.id, participant_id: pid, amount: c / 100 }));

  const { error: shareErr } = await supabase.from("trip_expense_shares").insert(shares);
  if (shareErr) redirect(`${back}?error=${encodeURIComponent(shareErr.message)}`);

  if (items.length > 0) {
    await supabase.from("trip_expense_items").insert(
      items.map((i, idx) => ({
        expense_id: expense.id,
        position: idx,
        description: String(i.description).slice(0, 200),
        amount: Math.round(i.amount * 100) / 100,
        consumed_by: i.consumed_by || null,
      }))
    );
  }

  revalidatePath(back);
  redirect(back);
}

export async function createGuestTripAlbum(formData: FormData) {
  const tripId = String(formData.get("trip_id"));
  const me = await myParticipant(tripId);
  if (!me) redirect("/login");

  const supabase = await createClient();
  const { data: trip } = await supabase
    .from("trips")
    .select("id, name")
    .eq("id", tripId)
    .maybeSingle();
  if (!trip) redirect("/");

  const { data: existing } = await supabase
    .from("albums")
    .select("id")
    .eq("trip_id", trip.id)
    .maybeSingle();
  if (!existing) {
    await supabase.from("albums").insert({
      household_id: me.household_id,
      name: trip.name,
      description: "Trip album",
      trip_id: trip.id,
    });
  }
  revalidatePath(`/guest/${tripId}`);
  redirect(`/guest/${tripId}`);
}
