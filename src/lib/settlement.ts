/**
 * Split-the-bill maths.
 * balances: paid minus share per participant (positive = is owed money).
 * settle(): minimal set of transfers using a greedy matcher.
 */
export type Balance = { participantId: string; name: string; paid: number; share: number; net: number };
export type Transfer = { from: string; to: string; amount: number };

export function computeBalances(
  participants: { id: string; name: string }[],
  expenses: { paid_by: string; amount: number }[],
  shares: { participant_id: string; amount: number }[]
): Balance[] {
  const map = new Map<string, Balance>(
    participants.map((p) => [p.id, { participantId: p.id, name: p.name, paid: 0, share: 0, net: 0 }])
  );
  for (const e of expenses) {
    const b = map.get(e.paid_by);
    if (b) b.paid += Number(e.amount);
  }
  for (const s of shares) {
    const b = map.get(s.participant_id);
    if (b) b.share += Number(s.amount);
  }
  for (const b of map.values()) b.net = Math.round((b.paid - b.share) * 100) / 100;
  return [...map.values()].sort((a, b) => b.net - a.net);
}

export function settle(balances: Balance[]): Transfer[] {
  const creditors = balances.filter((b) => b.net > 0.004).map((b) => ({ ...b }));
  const debtors = balances.filter((b) => b.net < -0.004).map((b) => ({ ...b, net: -b.net }));
  const transfers: Transfer[] = [];
  let ci = 0;
  for (const d of debtors) {
    let remaining = d.net;
    while (remaining > 0.004 && ci < creditors.length) {
      const c = creditors[ci];
      const pay = Math.min(remaining, c.net);
      transfers.push({ from: d.name, to: c.name, amount: Math.round(pay * 100) / 100 });
      remaining -= pay;
      c.net -= pay;
      if (c.net <= 0.004) ci++;
    }
  }
  return transfers;
}
