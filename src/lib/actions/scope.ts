"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireFinance } from "@/lib/finance";

export type TxnScope = "household" | "personal";

/**
 * Split finances: flip one transaction between 'household' (counts in the
 * family's budgets and stats) and 'personal' (yours alone — still in the
 * account balance, out of household reporting).
 *
 * Learning is deliberately gentle: we remember the choice on the payee
 * (default_scope, last choice wins) so FUTURE feed/CSV rows land right, but
 * we never bulk-rewrite the payee's existing transactions — those change one
 * by one (or via the grid's Personal filter). Predictable beats clever.
 */
export async function setScopeInline(
  txnId: string,
  scope: TxnScope
): Promise<{ ok: boolean; error?: string }> {
  if (scope !== "household" && scope !== "personal")
    return { ok: false, error: "Unknown scope" };
  const { membership } = await requireFinance("edit");
  const supabase = await createClient();
  const hid = membership.household_id;

  const { data: txn, error } = await supabase
    .from("finance_transactions")
    .update({ scope })
    .eq("id", txnId)
    .eq("household_id", hid)
    .select("payee_id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!txn) return { ok: false, error: "Transaction not found" };

  // remember the choice for this merchant — future ingests default to it
  if (txn.payee_id) {
    await supabase
      .from("finance_payees")
      .update({ default_scope: scope })
      .eq("id", txn.payee_id)
      .eq("household_id", hid);
  }

  revalidatePath("/finance");
  return { ok: true };
}
