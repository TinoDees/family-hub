import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Internal-transfer detection: money moved between the household's own
 * accounts is not income or spending. A transfer is a pair of transactions
 * with equal and opposite amounts, on different accounts, within 3 days.
 * Greedy matching (closest dates first per amount); anything ambiguous is
 * left alone — the grid has a manual ↔ toggle for those.
 * Works with both the RLS client (actions) and the admin client (webhook).
 */

type Cand = {
  id: string;
  account_id: string;
  amount: number;
  posted_at: string;
  used?: boolean;
};

const DAY = 86400000;
const daysApart = (a: string, b: string) =>
  Math.abs(new Date(a).getTime() - new Date(b).getTime()) / DAY;

export async function detectTransfers(
  client: SupabaseClient,
  householdId: string,
  opts: { since?: string } = {}
): Promise<number> {
  let q = client
    .from("finance_transactions")
    .select("id, account_id, amount, posted_at")
    .eq("household_id", householdId)
    .eq("is_transfer", false)
    .not("account_id", "is", null)
    .neq("amount", 0)
    .limit(5000);
  if (opts.since) q = q.gte("posted_at", opts.since);
  const { data } = await q;
  const txns = (data ?? []) as Cand[];

  // group by absolute amount in cents
  const byAmount = new Map<string, Cand[]>();
  for (const t of txns) {
    const key = Math.round(Math.abs(Number(t.amount)) * 100).toString();
    const arr = byAmount.get(key);
    if (arr) arr.push(t);
    else byAmount.set(key, [t]);
  }

  const pairs: [Cand, Cand][] = [];
  for (const group of byAmount.values()) {
    const outs = group.filter((t) => Number(t.amount) < 0);
    const ins = group.filter((t) => Number(t.amount) > 0);
    if (outs.length === 0 || ins.length === 0) continue;
    for (const o of outs) {
      let best: Cand | null = null;
      let bestD = Number.POSITIVE_INFINITY;
      for (const i of ins) {
        if (i.used || i.account_id === o.account_id) continue;
        const d = daysApart(o.posted_at, i.posted_at);
        if (d <= 3 && d < bestD) {
          best = i;
          bestD = d;
        }
      }
      if (best) {
        best.used = true;
        pairs.push([o, best]);
      }
    }
  }

  for (const [o, i] of pairs) {
    await client
      .from("finance_transactions")
      .update({ is_transfer: true, transfer_pair_id: i.id })
      .eq("id", o.id)
      .eq("household_id", householdId);
    await client
      .from("finance_transactions")
      .update({ is_transfer: true, transfer_pair_id: o.id })
      .eq("id", i.id)
      .eq("household_id", householdId);
  }

  return pairs.length;
}
