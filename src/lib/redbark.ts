import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Refresh live balances for a household's feed-linked accounts via the
 * Redbark REST API (GET /v1/balances — fetched from the bank, edge-cached
 * 5 min on Redbark's side). Best-effort: failures leave old values in place.
 */
export async function refreshBankBalances(householdId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: feed } = await admin
    .from("redbark_feeds")
    .select("api_key")
    .eq("household_id", householdId)
    .not("api_key", "is", null)
    .limit(1)
    .maybeSingle();
  if (!feed?.api_key) return;

  const { data: accounts } = await admin
    .from("finance_accounts")
    .select("id, external_id")
    .eq("household_id", householdId)
    .not("external_id", "is", null);
  if (!accounts || accounts.length === 0) return;

  const ids = accounts.map((a) => a.external_id).join(",");
  const res = await fetch(
    `https://api.redbark.com/v1/balances?accountIds=${encodeURIComponent(ids)}`,
    { headers: { Authorization: `Bearer ${feed.api_key}` }, cache: "no-store" }
  );
  if (!res.ok) return;
  const { data: balances } = (await res.json()) as {
    data: { accountId: string; currentBalance: string | null; availableBalance: string | null }[];
  };

  const byExternal = new Map(accounts.map((a) => [a.external_id!, a.id]));
  const now = new Date().toISOString();
  await Promise.all(
    (balances ?? [])
      .filter((b) => b.currentBalance !== null)
      .map((b) => {
        const accountId = byExternal.get(b.accountId);
        if (!accountId) return Promise.resolve(null);
        return admin
          .from("finance_accounts")
          .update({
            bank_balance: Number(b.currentBalance),
            bank_available: b.availableBalance !== null ? Number(b.availableBalance) : null,
            balance_synced_at: now,
          })
          .eq("id", accountId);
      })
  );
}
