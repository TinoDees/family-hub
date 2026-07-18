"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireFinance } from "@/lib/finance";
import { ruleMatches, type FinanceRule } from "@/lib/rules";

/**
 * The rule book — CRUD for user-written bank rules (mig 051), plus retro
 * application: when a rule is created or edited, every still-unsorted
 * transaction it matches gets the category as a SUGGESTION (✨ pills, accept
 * or dismiss) — the user always keeps the final word. New arrivals are
 * handled in the import/feed pipeline (category pre-filled as 🪄 to-confirm).
 */

export type RulePatch = {
  match_text?: string;
  match_field?: string;
  category_id?: string;
  enabled?: boolean;
};

/** Suggest this rule's category on every unsorted transaction it matches. */
async function retroApply(
  supabase: Awaited<ReturnType<typeof createClient>>,
  householdId: string,
  rule: FinanceRule
): Promise<number> {
  if (!rule.enabled || !rule.match_text.trim()) return 0;
  const { data: txns } = await supabase
    .from("finance_transactions")
    .select("id, description, merchant")
    .eq("household_id", householdId)
    .is("category_id", null)
    .eq("is_transfer", false)
    .order("posted_at", { ascending: false })
    .limit(2000);
  const hits = (txns ?? []).filter((t) => ruleMatches(rule, t.description, t.merchant)).map((t) => t.id);
  if (hits.length === 0) return 0;
  const { data: updated } = await supabase
    .from("finance_transactions")
    .update({ suggested_category_id: rule.category_id, suggestion_source: "rule" })
    .in("id", hits)
    .eq("household_id", householdId)
    .select("id");
  return updated?.length ?? 0;
}

export async function createRuleInline(
  matchText: string,
  matchField: string,
  categoryId: string
): Promise<{ ok: boolean; error?: string; rule?: FinanceRule & { created_at: string }; applied?: number }> {
  const { membership, userId } = await requireFinance("edit");
  const supabase = await createClient();
  const clean = matchText.trim().slice(0, 120);
  if (clean.length < 2) return { ok: false, error: "Give the rule at least 2 characters to match on" };
  if (!categoryId) return { ok: false, error: "Pick the category this rule should allocate" };
  const field = ["any", "description", "merchant"].includes(matchField) ? matchField : "any";
  const { data, error } = await supabase
    .from("finance_rules")
    .insert({
      household_id: membership.household_id,
      match_text: clean,
      match_field: field,
      category_id: categoryId,
      created_by: userId,
    })
    .select("id, match_text, match_field, category_id, enabled, created_at")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Could not save the rule" };
  const applied = await retroApply(supabase, membership.household_id, data as FinanceRule);
  revalidatePath("/finance");
  return { ok: true, rule: data as FinanceRule & { created_at: string }, applied };
}

export async function updateRuleInline(
  ruleId: string,
  patch: RulePatch
): Promise<{ ok: boolean; error?: string; applied?: number }> {
  const { membership } = await requireFinance("edit");
  const supabase = await createClient();
  const update: RulePatch = {};
  if (patch.match_text !== undefined) {
    const clean = patch.match_text.trim().slice(0, 120);
    if (clean.length < 2) return { ok: false, error: "Give the rule at least 2 characters to match on" };
    update.match_text = clean;
  }
  if (patch.match_field !== undefined)
    update.match_field = ["any", "description", "merchant"].includes(patch.match_field)
      ? patch.match_field
      : "any";
  if (patch.category_id !== undefined) {
    if (!patch.category_id) return { ok: false, error: "Pick a category" };
    update.category_id = patch.category_id;
  }
  if (patch.enabled !== undefined) update.enabled = patch.enabled;
  if (Object.keys(update).length === 0) return { ok: true, applied: 0 };

  const { data, error } = await supabase
    .from("finance_rules")
    .update(update)
    .eq("id", ruleId)
    .eq("household_id", membership.household_id)
    .select("id, match_text, match_field, category_id, enabled")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Rule not found" };
  const applied = await retroApply(supabase, membership.household_id, data as FinanceRule);
  revalidatePath("/finance");
  return { ok: true, applied };
}

export async function deleteRuleInline(ruleId: string): Promise<{ ok: boolean; error?: string }> {
  const { membership } = await requireFinance("edit");
  const supabase = await createClient();
  const { error } = await supabase
    .from("finance_rules")
    .delete()
    .eq("id", ruleId)
    .eq("household_id", membership.household_id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/finance");
  return { ok: true };
}
