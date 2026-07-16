"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireFinance } from "@/lib/finance";

function enc(s: string) {
  return encodeURIComponent(s);
}

function parseAmount(v: FormDataEntryValue | null): number {
  const n = parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}

export async function addGoal(formData: FormData) {
  const { membership } = await requireFinance("edit");
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim().slice(0, 120);
  const target = parseAmount(formData.get("target_amount"));
  if (!name) redirect(`/finance/goals?error=${enc("Give the goal a name")}`);
  if (!Number.isFinite(target) || target <= 0)
    redirect(`/finance/goals?error=${enc("The target needs to be a positive amount")}`);

  const saved = parseAmount(formData.get("saved_amount"));
  const startSaved = Number.isFinite(saved) && saved > 0 ? Math.min(saved, target) : 0;

  const { error } = await supabase.from("finance_goals").insert({
    household_id: membership.household_id,
    name,
    icon: String(formData.get("icon") ?? "").trim().slice(0, 8) || null,
    target_amount: target,
    saved_amount: startSaved,
    target_date: String(formData.get("target_date") || "") || null,
    notes: String(formData.get("notes") ?? "").trim().slice(0, 500) || null,
    achieved_at: startSaved >= target ? new Date().toISOString() : null,
  });
  revalidatePath("/finance/goals");
  redirect(error ? `/finance/goals?error=${enc(error.message)}` : "/finance/goals?saved=1");
}

export async function updateGoal(formData: FormData) {
  const { membership } = await requireFinance("edit");
  const supabase = await createClient();
  const goalId = String(formData.get("goal_id"));

  const { data: goal } = await supabase
    .from("finance_goals")
    .select("id, saved_amount, achieved_at")
    .eq("id", goalId)
    .eq("household_id", membership.household_id)
    .maybeSingle();
  if (!goal) redirect(`/finance/goals?error=${enc("That goal no longer exists")}`);

  const name = String(formData.get("name") ?? "").trim().slice(0, 120);
  const target = parseAmount(formData.get("target_amount"));
  if (!name) redirect(`/finance/goals?error=${enc("Give the goal a name")}`);
  if (!Number.isFinite(target) || target <= 0)
    redirect(`/finance/goals?error=${enc("The target needs to be a positive amount")}`);

  // if the target moved, re-derive achieved status from the saved amount
  const saved = Number(goal!.saved_amount);
  const achievedAt =
    saved >= target ? (goal!.achieved_at ?? new Date().toISOString()) : null;

  const { error } = await supabase
    .from("finance_goals")
    .update({
      name,
      icon: String(formData.get("icon") ?? "").trim().slice(0, 8) || null,
      target_amount: target,
      target_date: String(formData.get("target_date") || "") || null,
      notes: String(formData.get("notes") ?? "").trim().slice(0, 500) || null,
      achieved_at: achievedAt,
    })
    .eq("id", goalId)
    .eq("household_id", membership.household_id);
  revalidatePath("/finance/goals");
  redirect(error ? `/finance/goals?error=${enc(error.message)}` : "/finance/goals?saved=1");
}

export async function deleteGoal(formData: FormData) {
  const { membership } = await requireFinance("edit");
  const supabase = await createClient();
  const { error } = await supabase
    .from("finance_goals")
    .delete()
    .eq("id", String(formData.get("goal_id")))
    .eq("household_id", membership.household_id);
  revalidatePath("/finance/goals");
  redirect(error ? `/finance/goals?error=${enc(error.message)}` : "/finance/goals?saved=1");
}

/** Add money to a goal. Caps at the target and stamps achieved_at when it lands. */
export async function addToGoal(formData: FormData) {
  const { membership } = await requireFinance("edit");
  const supabase = await createClient();
  const goalId = String(formData.get("goal_id"));
  const amount = parseAmount(formData.get("amount"));
  if (!Number.isFinite(amount) || amount === 0)
    redirect(`/finance/goals?error=${enc("Type an amount to add")}`);

  const { data: goal } = await supabase
    .from("finance_goals")
    .select("id, target_amount, saved_amount, achieved_at")
    .eq("id", goalId)
    .eq("household_id", membership.household_id)
    .maybeSingle();
  if (!goal) redirect(`/finance/goals?error=${enc("That goal no longer exists")}`);

  const target = Number(goal!.target_amount);
  // negative amounts allowed as corrections; clamp to [0, target]
  const newSaved = Math.min(target, Math.max(0, Number(goal!.saved_amount) + amount));
  const reached = newSaved >= target;

  const { error } = await supabase
    .from("finance_goals")
    .update({
      saved_amount: newSaved,
      achieved_at: reached ? (goal!.achieved_at ?? new Date().toISOString()) : null,
    })
    .eq("id", goalId)
    .eq("household_id", membership.household_id);
  revalidatePath("/finance/goals");
  redirect(
    error
      ? `/finance/goals?error=${enc(error.message)}`
      : reached
        ? `/finance/goals?saved=${enc("Goal reached — nice work! 🎉")}`
        : "/finance/goals?saved=1"
  );
}
