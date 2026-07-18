"use server";

import { createClient } from "@/lib/supabase/server";
import { requireFinance, monthBounds } from "@/lib/finance";
import { learnPayeeDefault, propagatePayeeSuggestions } from "@/lib/payees";

/**
 * AI pre-classification of bank transactions. Suggestions are stored in
 * suggested_category_id — never written to category_id directly. The user
 * accepts, overrides, or dismisses; accepting also teaches the payee default,
 * so the AI is only ever needed once per merchant.
 * Env-gated on ANTHROPIC_API_KEY (same pattern as receipts.ts).
 */

export type Suggestion = { txnId: string; categoryId: string; confidence: number };

const MODEL = "claude-haiku-4-5-20251001";
const MAX_TXNS = 200;

export async function suggestCategories(
  monthKey: string
): Promise<{ ok: boolean; error?: string; suggestions: Suggestion[] }> {
  const { membership } = await requireFinance("edit");
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key)
    return { ok: false, error: "AI suggestions need ANTHROPIC_API_KEY configured.", suggestions: [] };

  const supabase = await createClient();
  const month = monthBounds(monthKey);

  const [{ data: cats }, { data: txns }] = await Promise.all([
    supabase
      .from("finance_categories")
      .select("id, name, kind")
      .eq("household_id", membership.household_id)
      .order("name"),
    supabase
      .from("finance_transactions")
      .select("id, description, merchant, amount, bank_category")
      .eq("household_id", membership.household_id)
      .gte("posted_at", month.start)
      .lte("posted_at", month.end)
      .is("category_id", null)
      .is("suggested_category_id", null)
      .eq("is_transfer", false)
      .order("posted_at", { ascending: false })
      .limit(MAX_TXNS),
  ]);

  if (!cats || cats.length === 0)
    return { ok: false, error: "Set up some categories first.", suggestions: [] };
  if (!txns || txns.length === 0) return { ok: true, suggestions: [] };

  const catByName = new Map(cats.map((c) => [c.name.trim().toLowerCase(), c.id]));
  const categoryList = cats.map((c) => `${c.name} (${c.kind})`).join("\n");
  const txnLines = txns
    .map((t, i) => {
      const amt = Number(t.amount);
      return `${i} | ${t.merchant ?? "-"} | ${t.description.slice(0, 120)} | ${amt < 0 ? "spend" : "income"} ${Math.abs(amt).toFixed(2)} | bank says: ${t.bank_category ?? "-"}`;
    })
    .join("\n");

  const prompt = `You categorise a family's bank transactions for a household budgeting app.

Available categories (name (kind)):
${categoryList}

Transactions (index | merchant | description | direction amount | bank's own category):
${txnLines}

Reply with ONLY a JSON array, no other text. For each transaction you can classify with reasonable confidence, output {"i": <index>, "c": "<exact category name from the list>", "p": <confidence 0-1>}. Rules: use ONLY names from the list, match spend transactions to expense categories and income to income categories, omit any transaction you are unsure about (below 0.5 confidence), never invent categories.`;

  let raw = "";
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 6000,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) return { ok: false, error: `AI request failed (${res.status})`, suggestions: [] };
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    raw = data.content?.find((b) => b.type === "text")?.text ?? "";
  } catch {
    return { ok: false, error: "Could not reach the AI service.", suggestions: [] };
  }

  let parsed: { i: number; c: string; p: number }[];
  try {
    parsed = JSON.parse(raw.replace(/^```(json)?/m, "").replace(/```\s*$/m, "").trim());
    if (!Array.isArray(parsed)) throw new Error("not an array");
  } catch {
    return { ok: false, error: "AI reply was unreadable — try again.", suggestions: [] };
  }

  const suggestions: Suggestion[] = [];
  for (const s of parsed) {
    const txn = txns[s.i];
    const categoryId = catByName.get(String(s.c ?? "").trim().toLowerCase());
    const confidence = Math.max(0, Math.min(1, Number(s.p) || 0));
    if (!txn || !categoryId || confidence < 0.5) continue;
    suggestions.push({ txnId: txn.id, categoryId, confidence });
  }

  await Promise.all(
    suggestions.map((s) =>
      supabase
        .from("finance_transactions")
        .update({
          suggested_category_id: s.categoryId,
          suggestion_source: "ai",
          suggestion_confidence: Math.round(s.confidence * 100) / 100,
        })
        .eq("id", s.txnId)
        .eq("household_id", membership.household_id)
    )
  );

  return { ok: true, suggestions };
}

export async function acceptSuggestion(txnId: string): Promise<{ ok: boolean; error?: string }> {
  const { membership } = await requireFinance("edit");
  const supabase = await createClient();
  const { data: txn } = await supabase
    .from("finance_transactions")
    .select("suggested_category_id")
    .eq("id", txnId)
    .eq("household_id", membership.household_id)
    .maybeSingle();
  if (!txn?.suggested_category_id) return { ok: false, error: "No suggestion to accept" };

  const { error } = await supabase
    .from("finance_transactions")
    .update({
      category_id: txn.suggested_category_id,
      reviewed: true, // accepting a suggestion IS the confirmation
      suggested_category_id: null,
      suggestion_source: null,
      suggestion_confidence: null,
    })
    .eq("id", txnId)
    .eq("household_id", membership.household_id);
  if (error) return { ok: false, error: error.message };

  await learnPayeeDefault(supabase, membership.household_id, txnId, txn.suggested_category_id);
  return { ok: true };
}

export async function dismissSuggestion(txnId: string): Promise<{ ok: boolean; error?: string }> {
  const { membership } = await requireFinance("edit");
  const supabase = await createClient();
  const { error } = await supabase
    .from("finance_transactions")
    .update({ suggested_category_id: null, suggestion_source: null, suggestion_confidence: null })
    .eq("id", txnId)
    .eq("household_id", membership.household_id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function acceptAllSuggestions(
  txnIds: string[]
): Promise<{ ok: boolean; accepted: number; error?: string }> {
  const { membership } = await requireFinance("edit");
  const supabase = await createClient();
  if (txnIds.length === 0 || txnIds.length > 500)
    return { ok: false, accepted: 0, error: "Nothing to accept" };

  const { data: txns } = await supabase
    .from("finance_transactions")
    .select("id, payee_id, suggested_category_id")
    .eq("household_id", membership.household_id)
    .in("id", txnIds)
    .not("suggested_category_id", "is", null);

  let accepted = 0;
  const payeeDefaults = new Map<string, string>();
  for (const t of txns ?? []) {
    const { error } = await supabase
      .from("finance_transactions")
      .update({
        category_id: t.suggested_category_id,
        reviewed: true, // accepting a suggestion IS the confirmation
        suggested_category_id: null,
        suggestion_source: null,
        suggestion_confidence: null,
      })
      .eq("id", t.id)
      .eq("household_id", membership.household_id);
    if (!error) {
      accepted++;
      if (t.payee_id) payeeDefaults.set(t.payee_id, t.suggested_category_id!);
    }
  }

  await Promise.all(
    [...payeeDefaults].map(async ([payeeId, categoryId]) => {
      await supabase
        .from("finance_payees")
        .update({ default_category_id: categoryId })
        .eq("id", payeeId)
        .eq("household_id", membership.household_id);
      await propagatePayeeSuggestions(supabase, membership.household_id, payeeId, categoryId);
    })
  );

  return { ok: true, accepted };
}
