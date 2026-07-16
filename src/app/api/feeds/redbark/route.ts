import { createHmac, timingSafeEqual, createHash } from "crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolvePayees, payeeMatchKey } from "@/lib/payees";
import { detectTransfers } from "@/lib/transfers";

export const runtime = "nodejs";

/**
 * Redbark webhook receiver (docs.redbark.com/api-reference/webhooks).
 * Signature: HMAC-SHA256 over `<timestamp>.<rawBody>`, header X-Redbark-Signature
 * ("sha256=<hex>"), replay window 5 min. The matching secret in redbark_feeds
 * identifies the household. Amounts arrive as integer cents.
 */

type RedbarkTxn = {
  id: string;
  amount: number;
  currency: string | null;
  status: string;
  description: string;
  class: string;
  account_id: string;
  account_name: string;
  local_date: string;
  merchant_name: string | null;
  category: string | null;
  custom_category?: string | null;
};

function humanise(cdr: string): string {
  const s = cdr.replaceAll("_", " ").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function guessAccountType(name: string): string {
  if (/credit|visa|master|amex|card/i.test(name)) return "credit";
  if (/saver|savings|isaver/i.test(name)) return "savings";
  return "bank";
}

export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get("x-redbark-signature") ?? "";
  const timestamp = req.headers.get("x-redbark-timestamp") ?? "";

  if (!signature || !timestamp) return NextResponse.json({ ok: false }, { status: 401 });
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300)
    return NextResponse.json({ ok: false, reason: "stale timestamp" }, { status: 401 });

  const admin = createAdminClient();
  const { data: feeds } = await admin
    .from("redbark_feeds")
    .select("id, household_id, webhook_secret");

  let householdId: string | null = null;
  const sigBuf = Buffer.from(signature);
  for (const feed of feeds ?? []) {
    const expected = Buffer.from(
      `sha256=${createHmac("sha256", feed.webhook_secret).update(`${timestamp}.${body}`).digest("hex")}`
    );
    if (sigBuf.length === expected.length && timingSafeEqual(sigBuf, expected)) {
      householdId = feed.household_id;
      break;
    }
  }
  if (!householdId) return NextResponse.json({ ok: false, reason: "unknown signature" }, { status: 401 });

  let event: {
    type?: string;
    data?: { new?: RedbarkTxn[]; updated?: RedbarkTxn[] };
  };
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (event.type !== "transactions.synced") {
    return NextResponse.json({ ok: true, ignored: event.type ?? "unknown" }); // trades etc. — later
  }

  const incoming = [...(event.data?.new ?? []), ...(event.data?.updated ?? [])].filter(
    (t) => t && t.id && t.local_date
  );
  if (incoming.length === 0) return NextResponse.json({ ok: true, inserted: 0 });

  // --- map Redbark accounts → Nestly accounts (create on first sight) ---
  const { data: accounts } = await admin
    .from("finance_accounts")
    .select("id, name, external_id")
    .eq("household_id", householdId);
  const byExternal = new Map((accounts ?? []).filter((a) => a.external_id).map((a) => [a.external_id!, a.id]));
  const byName = new Map((accounts ?? []).map((a) => [a.name.trim().toLowerCase(), a]));

  const accountIdFor = new Map<string, string>();
  for (const t of incoming) {
    if (accountIdFor.has(t.account_id)) continue;
    const existing = byExternal.get(t.account_id);
    if (existing) {
      accountIdFor.set(t.account_id, existing);
      continue;
    }
    // adopt an existing account with the same (or NAB-prefixed) name
    const candidate =
      byName.get(t.account_name.trim().toLowerCase()) ??
      byName.get(`nab ${t.account_name.trim().toLowerCase()}`) ??
      [...byName.values()].find((a) =>
        a.name.toLowerCase().includes(t.account_name.trim().toLowerCase())
      );
    if (candidate && !candidate.external_id) {
      await admin.from("finance_accounts").update({ external_id: t.account_id }).eq("id", candidate.id);
      accountIdFor.set(t.account_id, candidate.id);
      byExternal.set(t.account_id, candidate.id);
      continue;
    }
    const { data: created } = await admin
      .from("finance_accounts")
      .insert({
        household_id: householdId,
        name: t.account_name,
        type: guessAccountType(t.account_name),
        institution: /nab/i.test(t.account_name) ? "NAB" : null,
        currency: (t.currency ?? "aud").toUpperCase(),
        opening_balance: 0,
        external_id: t.account_id,
      })
      .select("id")
      .single();
    if (created) {
      accountIdFor.set(t.account_id, created.id);
      byExternal.set(t.account_id, created.id);
    }
  }

  // --- categories: match Redbark's CDR / custom category to Nestly names ---
  const { data: cats } = await admin
    .from("finance_categories")
    .select("id, name")
    .eq("household_id", householdId);
  const catByName = new Map((cats ?? []).map((c) => [c.name.trim().toLowerCase(), c.id]));

  // --- payees: find-or-create per merchant; a learned payee default beats the bank's label ---
  const payees = await resolvePayees(admin, householdId, incoming.map((t) => t.merchant_name));

  const records = incoming
    .map((t) => {
      const accountId = accountIdFor.get(t.account_id);
      if (!accountId) return null;
      const bankCategory = t.custom_category ?? (t.category ? humanise(t.category) : null);
      const matchKey = payeeMatchKey(t.merchant_name);
      const payee = matchKey ? payees.get(matchKey) : undefined;
      const categoryId =
        payee?.default_category_id ??
        (bankCategory ? (catByName.get(bankCategory.trim().toLowerCase()) ?? null) : null);
      return {
        household_id: householdId!,
        account_id: accountId,
        posted_at: t.local_date,
        description: t.description.slice(0, 500),
        merchant: t.merchant_name?.slice(0, 200) ?? null,
        amount: t.amount / 100, // integer cents → dollars
        currency: (t.currency ?? "aud").toUpperCase(),
        source: "feed",
        bank_category: bankCategory?.slice(0, 100) ?? null,
        txn_type: t.class?.slice(0, 100) ?? null,
        payee_id: payee?.id ?? null,
        category_id: categoryId,
        suggestion_source: categoryId ? (payee?.default_category_id ? "payee" : "bank") : null,
        external_id: t.id,
        import_hash: createHash("sha256").update(`redbark|${t.id}`).digest("hex"),
      };
    })
    .filter(Boolean) as Record<string, unknown>[];

  // upsert on (household_id, import_hash): new rows insert, re-deliveries and
  // updated transactions refresh the stored copy
  const { error, count } = await admin
    .from("finance_transactions")
    .upsert(records, { onConflict: "household_id,import_hash", ignoreDuplicates: false, count: "exact" });
  if (error) {
    console.error("redbark feed upsert failed:", error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 }); // 5xx → Redbark retries
  }

  // pair up internal transfers among recent transactions (best effort)
  let transfers = 0;
  try {
    const earliest = incoming.map((t) => t.local_date).sort()[0];
    const since = new Date(new Date(earliest).getTime() - 5 * 86400000).toISOString().slice(0, 10);
    transfers = await detectTransfers(admin, householdId, { since });
  } catch {
    /* next sync will catch them */
  }

  return NextResponse.json({ ok: true, received: records.length, upserted: count ?? records.length, transfers });
}
