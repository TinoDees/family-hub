/**
 * The rule book — user-written bank rules (mig 051), Xero-style.
 * "When the description (or merchant) contains X, allocate category Y."
 * Pure matching lives here so the CSV import, the feed webhook and the
 * retro-apply action all behave identically. First matching rule wins
 * (sort_order asc, then oldest first — the order the DB query returns).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type FinanceRule = {
  id: string;
  match_text: string;
  match_field: "any" | "description" | "merchant";
  category_id: string;
  enabled: boolean;
};

/** Case-insensitive contains-match of one rule against one transaction. */
export function ruleMatches(
  rule: Pick<FinanceRule, "match_text" | "match_field" | "enabled">,
  description: string | null | undefined,
  merchant: string | null | undefined
): boolean {
  if (!rule.enabled) return false;
  const needle = rule.match_text.trim().toLowerCase();
  if (!needle) return false;
  const inDesc = (description ?? "").toLowerCase().includes(needle);
  const inMerch = (merchant ?? "").toLowerCase().includes(needle);
  if (rule.match_field === "description") return inDesc;
  if (rule.match_field === "merchant") return inMerch;
  return inDesc || inMerch;
}

/** First matching rule's category, or null. Rules beat the payee default. */
export function matchRules(
  rules: FinanceRule[],
  description: string | null | undefined,
  merchant: string | null | undefined
): string | null {
  for (const r of rules) {
    if (ruleMatches(r, description, merchant)) return r.category_id;
  }
  return null;
}

/** Load a household's enabled rules in winning order. Works with RLS and admin clients. */
export async function loadRules(
  client: SupabaseClient,
  householdId: string
): Promise<FinanceRule[]> {
  const { data } = await client
    .from("finance_rules")
    .select("id, match_text, match_field, category_id, enabled")
    .eq("household_id", householdId)
    .eq("enabled", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  return (data ?? []) as FinanceRule[];
}
