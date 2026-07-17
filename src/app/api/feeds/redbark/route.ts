import { createHmac, timingSafeEqual, createHash } from "crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolvePayees, payeeMatchKey } from "@/lib/payees";
import { detectTransfers } from "@/lib/transfers";
import { logSecurityEvent } from "@/lib/telemetry";
import { requestIpHash } from "@/lib/hash";

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

/* ── pending-settlement matching (mig 046) ─────────────────────────────────
 * When "Include pending transactions" is on in Redbark, a purchase arrives
 * twice: first with status "pending", later settled — usually with a NEW bank
 * id, and often a rewritten description (CDR makes no guarantees). So the
 * hard match key is account + amount + a settlement window; description
 * similarity only RANKS candidates, oldest-first breaks ties. The winning
 * pending row is upgraded in place — the ledger never shows the purchase
 * twice, and anything the user already set (category, payee, notes, scope)
 * survives settlement. */

const SETTLE_WINDOW_DAYS = 8; // pending may settle up to this many days later
const PENDING_EXPIRY_DAYS = 14; // never-settled auths (declined/reversed) get swept

function normDesc(s: string | null | undefined): string[] {
  return (s ?? "")
    .toLowerCase()
    .replace(/[0-9]+/g, " ")
    .replace(/[^a-z ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

/** Token Jaccard similarity 0..1 between two descriptions. */
function descSim(a: string | null | undefined, b: string | null | undefined): number {
  const ta = new Set(normDesc(a));
  const tb = new Set(normDesc(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const w of ta) if (tb.has(w)) inter++;
  return inter / (ta.size + tb.size - inter);
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
  let feedId: string | null = null;
  const sigBuf = Buffer.from(signature);
  for (const feed of feeds ?? []) {
    const expected = Buffer.from(
      `sha256=${createHmac("sha256", feed.webhook_secret).update(`${timestamp}.${body}`).digest("hex")}`
    );
    if (sigBuf.length === expected.length && timingSafeEqual(sigBuf, expected)) {
      householdId = feed.household_id;
      feedId = feed.id;
      break;
    }
  }
  if (!householdId) {
    await logSecurityEvent("webhook_bad_signature", {
      path: "/api/feeds/redbark",
      ipHash: requestIpHash(req),
      detail: "signature did not match any feed",
    });
    return NextResponse.json({ ok: false, reason: "unknown signature" }, { status: 401 });
  }
  // liveness stamp for the daily health check
  if (feedId)
    await admin
      .from("redbark_feeds")
      .update({ last_received_at: new Date().toISOString() })
      .eq("id", feedId);

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
    .select("id, name, external_id, visibility")
    .eq("household_id", householdId);
  const byExternal = new Map((accounts ?? []).filter((a) => a.external_id).map((a) => [a.external_id!, a.id]));
  const byName = new Map((accounts ?? []).map((a) => [a.name.trim().toLowerCase(), a]));
  // split finances: rows on a private account default to 'personal' scope
  const visById = new Map((accounts ?? []).map((a) => [a.id, a.visibility as string]));

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
      visById.set(created.id, "shared"); // new accounts start shared
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

  // scope memory: a payee's last household/personal choice wins for new rows;
  // otherwise rows on a private account default to 'personal'
  const payeeIds = [...new Set([...payees.values()].map((p) => p.id))];
  const scopeByPayee = new Map<string, string | null>();
  if (payeeIds.length > 0) {
    const { data: payeeScopes } = await admin
      .from("finance_payees")
      .select("id, default_scope")
      .in("id", payeeIds);
    for (const p of payeeScopes ?? []) scopeByPayee.set(p.id, p.default_scope);
  }

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
        scope:
          (payee ? scopeByPayee.get(payee.id) : null) ??
          (visById.get(accountId) === "private" ? "personal" : "household"),
        suggestion_source: categoryId ? (payee?.default_category_id ? "payee" : "bank") : null,
        status: t.status === "pending" ? "pending" : "posted",
        external_id: t.id,
        import_hash: createHash("sha256").update(`redbark|${t.id}`).digest("hex"),
      };
    })
    .filter(Boolean) as Record<string, unknown>[];

  // ── settle pending rows: a posted arrival upgrades its pending twin ──
  let settled = 0;
  const settledRecords = new Set<Record<string, unknown>>();
  const postedRecords = records.filter((r) => r.status === "posted");
  if (postedRecords.length > 0) {
    // rows this delivery already knows by id (re-delivery / same-id settle) —
    // those take the plain upsert path, no matching needed
    const { data: known } = await admin
      .from("finance_transactions")
      .select("import_hash")
      .eq("household_id", householdId)
      .in("import_hash", postedRecords.map((r) => r.import_hash as string));
    const knownHashes = new Set((known ?? []).map((k) => k.import_hash));

    const { data: pendings } = await admin
      .from("finance_transactions")
      .select("id, account_id, amount, posted_at, description, category_id, payee_id, suggestion_source")
      .eq("household_id", householdId)
      .eq("status", "pending")
      .eq("source", "feed");
    const pool = (pendings ?? []).filter(Boolean);
    const claimed = new Set<string>();

    for (const r of records) {
      if (r.status !== "posted" || knownHashes.has(r.import_hash as string)) continue;
      const postedDate = new Date(`${String(r.posted_at)}T00:00:00Z`).getTime();
      const candidates = pool
        .filter((p) => {
          if (claimed.has(p.id) || p.account_id !== r.account_id) return false;
          if (Math.abs(Number(p.amount) - Number(r.amount)) >= 0.005) return false;
          const pendDate = new Date(`${p.posted_at}T00:00:00Z`).getTime();
          const daysLater = (postedDate - pendDate) / 86400000;
          return daysLater >= -1 && daysLater <= SETTLE_WINDOW_DAYS; // settles after auth (1-day tz slack)
        })
        .sort((a, b) => {
          const sim = descSim(b.description, r.description as string) - descSim(a.description, r.description as string);
          if (Math.abs(sim) > 0.001) return sim < 0 ? -1 : 1; // closest description first
          return a.posted_at < b.posted_at ? -1 : 1; // then oldest pending (FIFO)
        });
      const match = candidates[0];
      if (!match) continue;

      claimed.add(match.id);
      // Upgrade in place: bank-truth fields refresh, human choices survive.
      const userCategorised = match.category_id && match.suggestion_source === null;
      const { error: upErr } = await admin
        .from("finance_transactions")
        .update({
          status: "posted",
          posted_at: r.posted_at,
          description: r.description,
          merchant: r.merchant,
          bank_category: r.bank_category,
          txn_type: r.txn_type,
          external_id: r.external_id,
          import_hash: r.import_hash,
          ...(userCategorised ? {} : { category_id: r.category_id, suggestion_source: r.suggestion_source }),
          ...(match.payee_id ? {} : { payee_id: r.payee_id }),
        })
        .eq("id", match.id);
      if (!upErr) {
        settled++;
        settledRecords.add(r); // drop from the insert batch below
      }
    }
  }

  const toUpsert = records.filter((r) => !settledRecords.has(r));

  // upsert on (household_id, import_hash): new rows insert, re-deliveries and
  // updated transactions refresh the stored copy (incl. same-id settlements)
  const { error, count } = await admin
    .from("finance_transactions")
    .upsert(toUpsert, { onConflict: "household_id,import_hash", ignoreDuplicates: false, count: "exact" });
  if (error) {
    console.error("redbark feed upsert failed:", error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 }); // 5xx → Redbark retries
  }

  // sweep never-settled auths (declined / reversed) — best effort
  try {
    const cutoff = new Date(Date.now() - PENDING_EXPIRY_DAYS * 86400000).toISOString().slice(0, 10);
    await admin
      .from("finance_transactions")
      .delete()
      .eq("household_id", householdId)
      .eq("status", "pending")
      .eq("source", "feed")
      .lt("posted_at", cutoff);
  } catch {
    /* next delivery sweeps again */
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

  return NextResponse.json({
    ok: true,
    received: records.length,
    upserted: count ?? toUpsert.length,
    settled,
    transfers,
  });
}
