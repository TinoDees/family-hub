"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/module-guard";

export type SplitSaveResult = { ok: boolean; error?: string };

/**
 * Exact split: per-item "consumed by" allocations; whatever is unallocated
 * (shared items + tip/rounding difference) is split equally between
 * `sharedBetween`. Overwrites the expense's shares.
 */
export async function saveExpenseSplit(
  expenseId: string,
  allocations: Record<string, string>, // itemId -> participantId ("" = shared)
  sharedBetween: string[]
): Promise<SplitSaveResult> {
  const { membership } = await requireModule("holidays", "edit");
  const supabase = await createClient();

  const [{ data: expense }, { data: items }] = await Promise.all([
    supabase
      .from("trip_expenses")
      .select("id, trip_id, amount")
      .eq("id", expenseId)
      .eq("household_id", membership.household_id)
      .maybeSingle(),
    supabase
      .from("trip_expense_items")
      .select("id, amount")
      .eq("expense_id", expenseId),
  ]);
  if (!expense) return { ok: false, error: "Expense not found" };

  // persist consumed_by on items
  for (const item of items ?? []) {
    const pid = allocations[item.id] ?? "";
    await supabase
      .from("trip_expense_items")
      .update({ consumed_by: pid || null })
      .eq("id", item.id);
  }

  // maths in cents
  const totalCents = Math.round(Number(expense.amount) * 100);
  const perParticipant = new Map<string, number>();
  let allocatedCents = 0;
  for (const item of items ?? []) {
    const pid = allocations[item.id] ?? "";
    if (pid) {
      const cents = Math.round(Number(item.amount) * 100);
      perParticipant.set(pid, (perParticipant.get(pid) ?? 0) + cents);
      allocatedCents += cents;
    }
  }
  const poolCents = totalCents - allocatedCents;
  if (poolCents < 0)
    return { ok: false, error: "Allocated items add up to more than the bill total" };
  if (poolCents > 0 && sharedBetween.length === 0)
    return { ok: false, error: "Pick who shares the unallocated part" };

  if (poolCents > 0) {
    const base = Math.floor(poolCents / sharedBetween.length);
    const remainder = poolCents - base * sharedBetween.length;
    sharedBetween.forEach((pid, i) => {
      perParticipant.set(pid, (perParticipant.get(pid) ?? 0) + base + (i < remainder ? 1 : 0));
    });
  }

  await supabase.from("trip_expense_shares").delete().eq("expense_id", expenseId);
  const rows = [...perParticipant.entries()]
    .filter(([, cents]) => cents > 0)
    .map(([pid, cents]) => ({
      expense_id: expenseId,
      participant_id: pid,
      amount: cents / 100,
    }));
  if (rows.length > 0) {
    const { error } = await supabase.from("trip_expense_shares").insert(rows);
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath(`/holidays/${expense.trip_id}/expenses`);
  return { ok: true };
}

/** Back to a plain equal split; clears item allocations. */
export async function resetEqualSplit(
  expenseId: string,
  between: string[]
): Promise<SplitSaveResult> {
  const { membership } = await requireModule("holidays", "edit");
  if (between.length === 0) return { ok: false, error: "Pick at least one person" };
  const supabase = await createClient();

  const { data: expense } = await supabase
    .from("trip_expenses")
    .select("id, trip_id, amount")
    .eq("id", expenseId)
    .eq("household_id", membership.household_id)
    .maybeSingle();
  if (!expense) return { ok: false, error: "Expense not found" };

  await supabase
    .from("trip_expense_items")
    .update({ consumed_by: null })
    .eq("expense_id", expenseId);

  const cents = Math.round(Number(expense.amount) * 100);
  const base = Math.floor(cents / between.length);
  const remainder = cents - base * between.length;

  await supabase.from("trip_expense_shares").delete().eq("expense_id", expenseId);
  const { error } = await supabase.from("trip_expense_shares").insert(
    between.map((pid, i) => ({
      expense_id: expenseId,
      participant_id: pid,
      amount: (base + (i < remainder ? 1 : 0)) / 100,
    }))
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/holidays/${expense.trip_id}/expenses`);
  return { ok: true };
}
