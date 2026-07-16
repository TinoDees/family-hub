import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Payee resolution — the per-merchant memory behind auto-categorisation.
 * Normalisation must stay in sync with the SQL backfill in migration 038.
 */
export function payeeMatchKey(merchant: string | null | undefined): string | null {
  if (!merchant) return null;
  const key = merchant
    .toLowerCase()
    .replace(/[^a-z ]/g, " ")
    .replace(/ +/g, " ")
    .trim()
    .slice(0, 80);
  return key || null;
}

export type PayeeInfo = { id: string; default_category_id: string | null };

/**
 * Find-or-create payees for a batch of merchant names.
 * Works with both the RLS client (server actions) and the admin client (webhook).
 * Returns match_key → payee.
 */
export async function resolvePayees(
  client: SupabaseClient,
  householdId: string,
  merchants: (string | null | undefined)[]
): Promise<Map<string, PayeeInfo>> {
  const nameByKey = new Map<string, string>(); // first display name seen per key
  for (const m of merchants) {
    const key = payeeMatchKey(m);
    if (key && !nameByKey.has(key)) nameByKey.set(key, m!.trim().slice(0, 200));
  }
  const result = new Map<string, PayeeInfo>();
  if (nameByKey.size === 0) return result;

  const keys = [...nameByKey.keys()];
  const { data: existing } = await client
    .from("finance_payees")
    .select("id, match_key, default_category_id")
    .eq("household_id", householdId)
    .in("match_key", keys);
  for (const p of existing ?? [])
    result.set(p.match_key, { id: p.id, default_category_id: p.default_category_id });

  const missing = keys.filter((k) => !result.has(k));
  if (missing.length > 0) {
    const { data: created } = await client
      .from("finance_payees")
      .upsert(
        missing.map((k) => ({ household_id: householdId, name: nameByKey.get(k)!, match_key: k })),
        { onConflict: "household_id,match_key", ignoreDuplicates: false }
      )
      .select("id, match_key, default_category_id");
    for (const p of created ?? [])
      result.set(p.match_key, { id: p.id, default_category_id: p.default_category_id });
  }
  return result;
}

/** Remember the user's choice: the payee's default follows the last manual categorisation. */
export async function learnPayeeDefault(
  client: SupabaseClient,
  householdId: string,
  txnId: string,
  categoryId: string | null
): Promise<void> {
  if (!categoryId) return;
  const { data: txn } = await client
    .from("finance_transactions")
    .select("payee_id")
    .eq("id", txnId)
    .eq("household_id", householdId)
    .maybeSingle();
  if (!txn?.payee_id) return;
  await client
    .from("finance_payees")
    .update({ default_category_id: categoryId })
    .eq("id", txn.payee_id)
    .eq("household_id", householdId);
  await propagatePayeeSuggestions(client, householdId, txn.payee_id, categoryId, txnId);
}

/**
 * Auto-match, instantly: when a payee's category is learned, every OTHER
 * still-unsorted transaction of that payee gets it as a SUGGESTION — shown
 * with the accept ✓ / dismiss ✕ pills, so the user always keeps the
 * overwrite option. (Future feed/import rows apply the default directly.)
 */
export async function propagatePayeeSuggestions(
  client: SupabaseClient,
  householdId: string,
  payeeId: string,
  categoryId: string,
  excludeTxnId?: string
): Promise<void> {
  let q = client
    .from("finance_transactions")
    .update({ suggested_category_id: categoryId, suggestion_source: "payee" })
    .eq("household_id", householdId)
    .eq("payee_id", payeeId)
    .eq("is_transfer", false)
    .is("category_id", null);
  if (excludeTxnId) q = q.neq("id", excludeTxnId);
  await q;
}
