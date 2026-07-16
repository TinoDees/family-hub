"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireFinance } from "@/lib/finance";
import { detectTransfers } from "@/lib/transfers";

/** Scan the whole history for internal transfer pairs. */
export async function findTransfersInline(): Promise<{
  ok: boolean;
  found: number;
  error?: string;
}> {
  const { membership } = await requireFinance("edit");
  const supabase = await createClient();
  try {
    const found = await detectTransfers(supabase, membership.household_id);
    revalidatePath("/finance");
    return { ok: true, found };
  } catch (e) {
    return { ok: false, found: 0, error: e instanceof Error ? e.message : "Detection failed" };
  }
}

/** Manual ↔ toggle. Marking tries to find and mark the matching leg too; unmarking releases both. */
export async function setTransferInline(
  txnId: string,
  makeTransfer: boolean
): Promise<{ ok: boolean; pairedId?: string | null; error?: string }> {
  const { membership } = await requireFinance("edit");
  const supabase = await createClient();
  const hid = membership.household_id;

  const { data: txn } = await supabase
    .from("finance_transactions")
    .select("id, account_id, amount, posted_at, transfer_pair_id")
    .eq("id", txnId)
    .eq("household_id", hid)
    .maybeSingle();
  if (!txn) return { ok: false, error: "Transaction not found" };

  if (!makeTransfer) {
    await supabase
      .from("finance_transactions")
      .update({ is_transfer: false, transfer_pair_id: null })
      .in("id", txn.transfer_pair_id ? [txn.id, txn.transfer_pair_id] : [txn.id])
      .eq("household_id", hid);
    revalidatePath("/finance");
    return { ok: true, pairedId: txn.transfer_pair_id ?? null };
  }

  // find the other leg: opposite amount, different account, within 3 days
  let pairedId: string | null = null;
  if (txn.account_id) {
    const from = new Date(new Date(txn.posted_at).getTime() - 3 * 86400000)
      .toISOString()
      .slice(0, 10);
    const to = new Date(new Date(txn.posted_at).getTime() + 3 * 86400000)
      .toISOString()
      .slice(0, 10);
    const { data: candidates } = await supabase
      .from("finance_transactions")
      .select("id, account_id, posted_at")
      .eq("household_id", hid)
      .eq("is_transfer", false)
      .eq("amount", -Number(txn.amount))
      .neq("account_id", txn.account_id)
      .not("account_id", "is", null)
      .gte("posted_at", from)
      .lte("posted_at", to)
      .limit(5);
    const best = (candidates ?? [])
      .map((c) => ({
        ...c,
        d: Math.abs(new Date(c.posted_at).getTime() - new Date(txn.posted_at).getTime()),
      }))
      .sort((a, b) => a.d - b.d)[0];
    pairedId = best?.id ?? null;
  }

  await supabase
    .from("finance_transactions")
    .update({ is_transfer: true, transfer_pair_id: pairedId })
    .eq("id", txn.id)
    .eq("household_id", hid);
  if (pairedId)
    await supabase
      .from("finance_transactions")
      .update({ is_transfer: true, transfer_pair_id: txn.id })
      .eq("id", pairedId)
      .eq("household_id", hid);

  revalidatePath("/finance");
  return { ok: true, pairedId };
}
