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

  // own family + every household member join automatically
  const { data: family } = await supabase
    .from("trip_families")
    .insert({
      trip_id: data.id,
      household_id: membership.household_id,
      name: membership.household.name,
      linked_household_id: membership.household_id,
    })
    .select("id")
    .single();
  const { data: members } = await supabase
    .from("household_members")
    .select("user_id, display_name")
    .eq("household_id", membership.household_id);
  if (family && members) {
    await supabase.from("trip_participants").insert(
      members.map((m) => ({
        trip_id: data.id,
        household_id: membership.household_id,
        user_id: m.user_id,
        name: m.display_name ?? "Member",
        family_id: family.id,
        is_manager: m.user_id === userId,
      }))
    );
  }
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
    family_id: String(formData.get("family_id") || "") || null,
    email: String(formData.get("email") ?? "").trim().toLowerCase() || null,
    is_manager: formData.get("is_manager") === "on",
  });
  revalidatePath(`/holidays/${tripId}`);
  redirect(`/holidays/${tripId}`);
}

export async function addTripFamily(formData: FormData) {
  const { membership } = await requireModule("holidays", "edit");
  const tripId = String(formData.get("trip_id"));
  const name = String(formData.get("name") ?? "").trim();
  if (!name) redirect(`/holidays/${tripId}?error=Family+needs+a+name`);
  const supabase = await createClient();
  await supabase.from("trip_families").insert({
    trip_id: tripId,
    household_id: membership.household_id,
    name,
  });
  revalidatePath(`/holidays/${tripId}`);
  redirect(`/holidays/${tripId}`);
}

export async function removeTripFamily(formData: FormData) {
  const { membership } = await requireModule("holidays", "edit");
  const tripId = String(formData.get("trip_id"));
  const familyId = String(formData.get("family_id"));
  const supabase = await createClient();
  const { count } = await supabase
    .from("trip_participants")
    .select("id", { count: "exact", head: true })
    .eq("family_id", familyId);
  if ((count ?? 0) > 0)
    redirect(`/holidays/${tripId}?error=Remove+the+family+members+first`);
  await supabase
    .from("trip_families")
    .delete()
    .eq("id", familyId)
    .eq("household_id", membership.household_id);
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

  const back = `/holidays/${tripId}/expenses`;
  if (!description) redirect(`${back}?error=Expense+needs+a+description`);
  if (!amount || amount <= 0) redirect(`${back}?error=Amount+must+be+positive`);
  if (!paidBy) redirect(`${back}?error=Pick+who+paid`);
  if (sharedWith.length === 0) redirect(`${back}?error=Pick+who+shares+the+cost`);

  const isTreat = formData.get("is_treat") === "on";
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
      receipt_photo_id: String(formData.get("receipt_photo_id") || "") || null,
      is_treat: isTreat,
      original_amount: parseFloat(String(formData.get("original_amount") || "")) || null,
      original_currency: String(formData.get("original_currency") || "").trim().toUpperCase() || null,
      created_by: userId,
    })
    .select("id")
    .single();
  if (error || !expense) redirect(`${back}?error=${enc(error?.message ?? "Could not save")}`);

  // shares: exact when items are allocated, else equal
  type ItemIn = { description: string; amount: number; original_amount?: number | null; consumed_by?: string | null };
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
  if (isTreat) {
    // whole bill on the payer — nothing to split
    const { error: shareErr } = await supabase.from("trip_expense_shares").insert([
      { expense_id: expense.id, participant_id: paidBy, amount },
    ]);
    if (shareErr) {
      await supabase.from("trip_expenses").delete().eq("id", expense.id);
      redirect(`${back}?error=${enc(shareErr.message)}`);
    }
    if (items.length > 0) {
      await supabase.from("trip_expense_items").insert(
        items.map((i, idx) => ({
          expense_id: expense.id,
          position: idx,
          description: String(i.description).slice(0, 200),
          amount: Math.round(i.amount * 100) / 100,
          original_amount:
            typeof i.original_amount === "number" ? Math.round(i.original_amount * 100) / 100 : null,
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
  if (shareErr) {
    await supabase.from("trip_expenses").delete().eq("id", expense.id);
    redirect(`${back}?error=${enc(shareErr.message)}`);
  }

  if (items.length > 0) {
    await supabase.from("trip_expense_items").insert(
      items.map((i, idx) => ({
        expense_id: expense.id,
        position: idx,
        description: String(i.description).slice(0, 200),
        amount: Math.round(i.amount * 100) / 100,
        original_amount:
          typeof i.original_amount === "number" ? Math.round(i.original_amount * 100) / 100 : null,
        consumed_by: i.consumed_by || null,
      }))
    );
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
  revalidatePath(`/holidays/${tripId}/expenses`);
  redirect(`/holidays/${tripId}/expenses`);
}

export async function createTripAlbum(formData: FormData) {
  const { membership } = await requireModule("holidays", "edit");
  const tripId = String(formData.get("trip_id"));
  const supabase = await createClient();
  const { data: trip } = await supabase
    .from("trips")
    .select("id, name")
    .eq("id", tripId)
    .eq("household_id", membership.household_id)
    .maybeSingle();
  if (!trip) redirect("/holidays");

  const { data: existing } = await supabase
    .from("albums")
    .select("id")
    .eq("trip_id", trip.id)
    .maybeSingle();
  if (!existing) {
    await supabase.from("albums").insert({
      household_id: membership.household_id,
      name: trip.name,
      description: "Trip album",
      trip_id: trip.id,
    });
  }
  revalidatePath(`/holidays/${tripId}/photos`);
  redirect(`/holidays/${tripId}/photos`);
}

export async function createTripInvite(formData: FormData) {
  const { membership } = await requireModule("holidays", "edit");
  const tripId = String(formData.get("trip_id"));
  const participantId = String(formData.get("participant_id"));
  const supabase = await createClient();

  const { data: participant } = await supabase
    .from("trip_participants")
    .select("id, user_id")
    .eq("id", participantId)
    .eq("trip_id", tripId)
    .eq("household_id", membership.household_id)
    .maybeSingle();
  if (!participant) redirect(`/holidays/${tripId}?error=Participant+not+found`);
  if (participant.user_id) redirect(`/holidays/${tripId}?error=Already+claimed`);

  // one live invite per participant
  await supabase
    .from("trip_invites")
    .delete()
    .eq("participant_id", participantId)
    .is("accepted_at", null);
  const { error } = await supabase.from("trip_invites").insert({
    trip_id: tripId,
    participant_id: participantId,
    household_id: membership.household_id,
  });
  if (error) redirect(`/holidays/${tripId}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/holidays/${tripId}`);
  redirect(`/holidays/${tripId}`);
}

/** Add a participant from inside the expense form; returns the new row. */
export async function createParticipantInline(
  tripId: string,
  name: string
): Promise<{ ok: boolean; id?: string; name?: string; error?: string }> {
  const { membership } = await requireModule("holidays", "edit");
  const clean = name.trim().slice(0, 100);
  if (!clean) return { ok: false, error: "Name required" };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("trip_participants")
    .insert({
      trip_id: tripId,
      household_id: membership.household_id,
      name: clean,
    })
    .select("id, name")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Could not add" };
  revalidatePath(`/holidays/${tripId}`);
  return { ok: true, id: data.id, name: data.name };
}
