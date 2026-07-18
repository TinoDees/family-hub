"use server";

import { createHash } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireFinance } from "@/lib/finance";
import { resolvePayees, payeeMatchKey, learnPayeeDefault } from "@/lib/payees";

function enc(s: string) {
  return encodeURIComponent(s);
}

export async function addAccount(formData: FormData) {
  const { membership } = await requireFinance("edit");
  const supabase = await createClient();
  const { error } = await supabase.from("finance_accounts").insert({
    household_id: membership.household_id,
    name: String(formData.get("name") ?? "").trim(),
    type: String(formData.get("type") ?? "bank"),
    institution: String(formData.get("institution") ?? "").trim() || null,
    currency: membership.household.base_currency,
    opening_balance: parseFloat(String(formData.get("opening_balance") ?? "0")) || 0,
  });
  redirect(
    error
      ? `/finance/setup?error=${enc(friendly(error.message))}&sec=accounts#accounts`
      : "/finance/setup?saved=1&sec=accounts#accounts"
  );
}

function friendly(msg: string): string {
  if (/duplicate key/i.test(msg)) return "That name already exists — pick a different one.";
  return msg;
}

export async function addCategory(formData: FormData) {
  const { membership } = await requireFinance("edit");
  const supabase = await createClient();
  const { error } = await supabase.from("finance_categories").insert({
    household_id: membership.household_id,
    name: String(formData.get("name") ?? "").trim(),
    icon:
      String(formData.get("icon_custom") ?? "").trim() ||
      String(formData.get("icon") ?? "").trim() ||
      null,
    kind: String(formData.get("kind") ?? "expense"),
  });
  redirect(
    error
      ? `/finance/setup?error=${enc(friendly(error.message))}&sec=categories#categories`
      : "/finance/setup?saved=1&sec=categories#categories"
  );
}

export async function updateCategory(formData: FormData) {
  const { membership } = await requireFinance("edit");
  const supabase = await createClient();
  const { error } = await supabase
    .from("finance_categories")
    .update({
      name: String(formData.get("name") ?? "").trim(),
      kind: String(formData.get("kind") ?? "expense"),
      ...((): { icon?: string } => {
        const icon =
          String(formData.get("icon_custom") ?? "").trim() ||
          String(formData.get("icon") ?? "").trim();
        return icon ? { icon } : {}; // untouched = keep the current emoji
      })(),
    })
    .eq("id", String(formData.get("category_id")))
    .eq("household_id", membership.household_id);
  redirect(
    error
      ? `/finance/setup?error=${enc(friendly(error.message))}&sec=categories#categories`
      : "/finance/setup?saved=1&sec=categories#categories"
  );
}

export async function deleteCategory(formData: FormData) {
  const { membership } = await requireFinance("edit");
  const supabase = await createClient();
  const categoryId = String(formData.get("category_id"));
  // keep the transactions, just unlink them; drop any budget for it
  await supabase
    .from("finance_transactions")
    .update({ category_id: null })
    .eq("category_id", categoryId)
    .eq("household_id", membership.household_id);
  await supabase
    .from("finance_budgets")
    .delete()
    .eq("category_id", categoryId)
    .eq("household_id", membership.household_id);
  const { error } = await supabase
    .from("finance_categories")
    .delete()
    .eq("id", categoryId)
    .eq("household_id", membership.household_id);
  redirect(
    error
      ? `/finance/setup?error=${enc(error.message)}&sec=categories#categories`
      : "/finance/setup?saved=1&sec=categories#categories"
  );
}

export async function seedCategories() {
  const { membership } = await requireFinance("edit");
  const supabase = await createClient();
  const { error } = await supabase.rpc("seed_default_categories", {
    p_household: membership.household_id,
  });
  redirect(error ? `/finance/setup?error=${enc(error.message)}` : "/finance/setup?saved=1");
}

export async function setBudget(formData: FormData) {
  const { membership } = await requireFinance("edit");
  const supabase = await createClient();
  const categoryId = String(formData.get("category_id"));
  const amount = parseFloat(String(formData.get("amount") ?? "0")) || 0;

  if (amount <= 0) {
    await supabase
      .from("finance_budgets")
      .delete()
      .eq("household_id", membership.household_id)
      .eq("category_id", categoryId);
  } else {
    const { error } = await supabase.from("finance_budgets").upsert(
      {
        household_id: membership.household_id,
        category_id: categoryId,
        amount,
      },
      { onConflict: "household_id,category_id" }
    );
    if (error) redirect(`/finance/setup?error=${enc(error.message)}`);
  }
  revalidatePath("/finance");
  redirect("/finance/setup?saved=1");
}

export async function addTransaction(formData: FormData) {
  const { membership, userId } = await requireFinance("edit");
  const supabase = await createClient();
  const rawAmount = parseFloat(String(formData.get("amount") ?? ""));
  const kind = String(formData.get("kind") ?? "expense");
  const amount = kind === "expense" ? -Math.abs(rawAmount) : Math.abs(rawAmount);

  const { error } = await supabase.from("finance_transactions").insert({
    household_id: membership.household_id,
    account_id: String(formData.get("account_id") || "") || null,
    posted_at: String(formData.get("posted_at")),
    description: String(formData.get("description") ?? "").trim(),
    amount,
    currency: membership.household.base_currency,
    category_id: String(formData.get("category_id") || "") || null,
    reviewed: !!String(formData.get("category_id") || ""), // manually entered = confirmed
    source: "manual",
    created_by: userId,
  });
  redirect(
    error
      ? `/finance/transactions?error=${enc(error.message)}`
      : "/finance/transactions?saved=1"
  );
}

export async function setTransactionCategory(formData: FormData) {
  const { membership } = await requireFinance("edit");
  const supabase = await createClient();

  // typed name: match an existing category (case-insensitive) or create it
  const typed = String(formData.get("category_name") ?? "").trim();
  let categoryId: string | null = String(formData.get("category_id") || "") || null;
  if (formData.has("category_name")) {
    if (!typed) {
      categoryId = null;
    } else {
      const { data: cats } = await supabase
        .from("finance_categories")
        .select("id, name")
        .eq("household_id", membership.household_id);
      const hit = (cats ?? []).find((c) => c.name.trim().toLowerCase() === typed.toLowerCase());
      if (hit) categoryId = hit.id;
      else {
        const { data: txn } = await supabase
          .from("finance_transactions")
          .select("amount")
          .eq("id", String(formData.get("txn_id")))
          .maybeSingle();
        const { data: created, error } = await supabase
          .from("finance_categories")
          .insert({
            household_id: membership.household_id,
            name: typed.slice(0, 60),
            kind: Number(txn?.amount ?? -1) > 0 ? "income" : "expense",
            icon: null,
          })
          .select("id")
          .single();
        if (error || !created)
          redirect(`/finance/transactions?m=${formData.get("m") ?? ""}&error=${enc(error?.message ?? "Could not create category")}`);
        categoryId = created!.id;
      }
    }
  }

  await supabase
    .from("finance_transactions")
    .update({
      category_id: categoryId,
      reviewed: !!categoryId, // a person chose it — that IS the confirmation
      suggested_category_id: null,
      suggestion_source: null,
      suggestion_confidence: null,
    })
    .eq("id", String(formData.get("txn_id")))
    .eq("household_id", membership.household_id);
  await learnPayeeDefault(supabase, membership.household_id, String(formData.get("txn_id")), categoryId);
  revalidatePath("/finance");
  redirect(`/finance/transactions?m=${formData.get("m") ?? ""}`);
}

/** Inline (no-redirect) helpers for the transactions grid — smooth UX, no reloads. */
export async function createCategoryInline(
  name: string,
  icon: string,
  kind: string
): Promise<{ ok: boolean; error?: string; category?: { id: string; name: string; icon: string | null; kind: string; parent_id: string | null } }> {
  const { membership } = await requireFinance("edit");
  const supabase = await createClient();
  const clean = name.trim().slice(0, 60);
  if (!clean) return { ok: false, error: "Give the category a name" };
  const { data, error } = await supabase
    .from("finance_categories")
    .insert({
      household_id: membership.household_id,
      name: clean,
      icon: icon.trim().slice(0, 8) || null,
      kind: kind === "income" ? "income" : "expense",
    })
    .select("id, name, icon, kind, parent_id")
    .single();
  if (error || !data)
    return { ok: false, error: /duplicate/i.test(error?.message ?? "") ? "That category already exists" : (error?.message ?? "Failed") };
  return { ok: true, category: data };
}

/** Inline category edit for the setup grid — patch only the fields provided. */
export async function updateCategoryInline(
  categoryId: string,
  patch: { name?: string; icon?: string; kind?: string }
): Promise<{ ok: boolean; error?: string }> {
  const { membership } = await requireFinance("edit");
  const supabase = await createClient();
  const update: { name?: string; icon?: string; kind?: string } = {};
  if (patch.name !== undefined) {
    const clean = patch.name.trim().slice(0, 60);
    if (!clean) return { ok: false, error: "Give the category a name" };
    update.name = clean;
  }
  if (patch.icon !== undefined) {
    const icon = patch.icon.trim().slice(0, 8);
    if (icon) update.icon = icon;
  }
  if (patch.kind !== undefined) update.kind = patch.kind === "income" ? "income" : "expense";
  if (Object.keys(update).length === 0) return { ok: true };
  const { error } = await supabase
    .from("finance_categories")
    .update(update)
    .eq("id", categoryId)
    .eq("household_id", membership.household_id);
  if (error) return { ok: false, error: friendly(error.message) };
  revalidatePath("/finance");
  return { ok: true };
}

/**
 * Nest / un-nest a category (one level deep). Nesting aligns the child's kind
 * with the parent's so expense/income never mix inside one group.
 */
export async function setCategoryParentInline(
  categoryId: string,
  parentId: string | null
): Promise<{ ok: boolean; error?: string; kind?: string }> {
  const { membership } = await requireFinance("edit");
  const supabase = await createClient();
  if (parentId === categoryId) return { ok: false, error: "A category can't be its own parent" };
  if (parentId) {
    const { data: parent } = await supabase
      .from("finance_categories")
      .select("id, parent_id, kind")
      .eq("id", parentId)
      .eq("household_id", membership.household_id)
      .maybeSingle();
    if (!parent) return { ok: false, error: "Parent category not found" };
    if (parent.parent_id) return { ok: false, error: "Only one level of sub-categories — pick a top-level category" };
    const { data: kids } = await supabase
      .from("finance_categories")
      .select("id")
      .eq("parent_id", categoryId)
      .eq("household_id", membership.household_id)
      .limit(1);
    if (kids && kids.length > 0)
      return { ok: false, error: "This category has sub-categories of its own — move those out first" };
    const { error } = await supabase
      .from("finance_categories")
      .update({ parent_id: parentId, kind: parent.kind })
      .eq("id", categoryId)
      .eq("household_id", membership.household_id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/finance");
    return { ok: true, kind: parent.kind };
  }
  const { error } = await supabase
    .from("finance_categories")
    .update({ parent_id: null })
    .eq("id", categoryId)
    .eq("household_id", membership.household_id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/finance");
  return { ok: true };
}

/** Inline delete for the setup grid — keep transactions, drop budgets, then the category. */
export async function deleteCategoryInline(categoryId: string): Promise<{ ok: boolean; error?: string }> {
  const { membership } = await requireFinance("edit");
  const supabase = await createClient();
  await supabase
    .from("finance_transactions")
    .update({ category_id: null })
    .eq("category_id", categoryId)
    .eq("household_id", membership.household_id);
  await supabase
    .from("finance_budgets")
    .delete()
    .eq("category_id", categoryId)
    .eq("household_id", membership.household_id);
  const { error } = await supabase
    .from("finance_categories")
    .delete()
    .eq("id", categoryId)
    .eq("household_id", membership.household_id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/finance");
  return { ok: true };
}

/** Inline budget upsert for the setup grid — 0 or less removes the budget. */
export async function setBudgetInline(
  categoryId: string,
  amount: number
): Promise<{ ok: boolean; error?: string }> {
  const { membership } = await requireFinance("edit");
  const supabase = await createClient();
  if (!Number.isFinite(amount) || amount <= 0) {
    const { error } = await supabase
      .from("finance_budgets")
      .delete()
      .eq("household_id", membership.household_id)
      .eq("category_id", categoryId);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase.from("finance_budgets").upsert(
      {
        household_id: membership.household_id,
        category_id: categoryId,
        amount,
      },
      { onConflict: "household_id,category_id" }
    );
    if (error) return { ok: false, error: error.message };
  }
  revalidatePath("/finance");
  return { ok: true };
}

export async function assignCategoryInline(
  txnId: string,
  categoryId: string | null
): Promise<{ ok: boolean; error?: string }> {
  const { membership } = await requireFinance("edit");
  const supabase = await createClient();
  const { error } = await supabase
    .from("finance_transactions")
    .update({
      category_id: categoryId,
      reviewed: !!categoryId, // a person chose it — that IS the confirmation
      suggested_category_id: null,
      suggestion_source: null,
      suggestion_confidence: null,
    })
    .eq("id", txnId)
    .eq("household_id", membership.household_id);
  if (error) return { ok: false, error: error.message };
  await learnPayeeDefault(supabase, membership.household_id, txnId, categoryId);
  return { ok: true };
}

/** Confirm a rule-applied category (payee memory / bank match) — the tick. */
export async function confirmCategoryInline(txnId: string): Promise<{ ok: boolean; error?: string }> {
  const { membership } = await requireFinance("edit");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("finance_transactions")
    .update({ reviewed: true, suggestion_source: null, suggestion_confidence: null })
    .eq("id", txnId)
    .eq("household_id", membership.household_id)
    .not("category_id", "is", null)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Nothing to confirm — give it a category first" };
  revalidatePath("/finance");
  return { ok: true };
}

/** Confirm every rule-applied category in one go ("Confirm all shown"). */
export async function confirmAllInline(
  txnIds: string[]
): Promise<{ ok: boolean; confirmed: number; error?: string }> {
  const { membership } = await requireFinance("edit");
  const supabase = await createClient();
  if (txnIds.length === 0 || txnIds.length > 1000)
    return { ok: false, confirmed: 0, error: "Nothing to confirm" };
  const { data, error } = await supabase
    .from("finance_transactions")
    .update({ reviewed: true, suggestion_source: null, suggestion_confidence: null })
    .eq("household_id", membership.household_id)
    .in("id", txnIds)
    .not("category_id", "is", null)
    .eq("reviewed", false)
    .select("id");
  if (error) return { ok: false, confirmed: 0, error: error.message };
  revalidatePath("/finance");
  return { ok: true, confirmed: data?.length ?? 0 };
}

export async function deleteTransactionInline(txnId: string): Promise<{ ok: boolean; error?: string }> {
  const { membership } = await requireFinance("edit");
  const supabase = await createClient();
  const { error } = await supabase
    .from("finance_transactions")
    .delete()
    .eq("id", txnId)
    .eq("household_id", membership.household_id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function deleteTransaction(formData: FormData) {
  const { membership } = await requireFinance("edit");
  const supabase = await createClient();
  await supabase
    .from("finance_transactions")
    .delete()
    .eq("id", String(formData.get("txn_id")))
    .eq("household_id", membership.household_id);
  revalidatePath("/finance");
  redirect(`/finance/transactions?m=${formData.get("m") ?? ""}`);
}

export type ImportRow = {
  date: string; // ISO yyyy-mm-dd
  amount: number; // signed
  description: string;
  merchant?: string;
  bankCategory?: string;
  txnType?: string;
};

export async function importTransactions(
  accountId: string,
  rows: ImportRow[]
): Promise<{ ok: boolean; inserted: number; skipped: number; error?: string }> {
  const { membership, userId } = await requireFinance("edit");
  if (!accountId) return { ok: false, inserted: 0, skipped: 0, error: "Pick an account" };
  if (rows.length === 0) return { ok: false, inserted: 0, skipped: 0, error: "No rows to import" };
  if (rows.length > 5000)
    return { ok: false, inserted: 0, skipped: 0, error: "Too many rows in one import (max 5000)" };

  const supabase = await createClient();
  // auto-categorise: if the bank's category name matches one of ours, use it
  const { data: cats } = await supabase
    .from("finance_categories")
    .select("id, name")
    .eq("household_id", membership.household_id);
  const catByName = new Map((cats ?? []).map((c) => [c.name.trim().toLowerCase(), c.id]));
  const payees = await resolvePayees(supabase, membership.household_id, rows.map((r) => r.merchant));

  // split finances: default scope per row — the payee's learned choice wins,
  // else rows on a private account are 'personal', otherwise 'household'
  const { data: destAccount } = await supabase
    .from("finance_accounts")
    .select("visibility")
    .eq("id", accountId)
    .eq("household_id", membership.household_id)
    .maybeSingle();
  if (!destAccount) return { ok: false, inserted: 0, skipped: 0, error: "That account doesn't exist (or isn't yours to see)" };
  const accountScope = destAccount.visibility === "private" ? "personal" : "household";
  const payeeIds = [...new Set([...payees.values()].map((p) => p.id))];
  const scopeByPayee = new Map<string, string | null>();
  if (payeeIds.length > 0) {
    const { data: payeeScopes } = await supabase
      .from("finance_payees")
      .select("id, default_scope")
      .in("id", payeeIds);
    for (const p of payeeScopes ?? []) scopeByPayee.set(p.id, p.default_scope);
  }

  const records = rows.map((r) => {
    const matchKey = payeeMatchKey(r.merchant);
    const payee = matchKey ? payees.get(matchKey) : undefined;
    const categoryId =
      payee?.default_category_id ??
      (r.bankCategory ? (catByName.get(r.bankCategory.trim().toLowerCase()) ?? null) : null);
    return {
    household_id: membership.household_id,
    account_id: accountId,
    posted_at: r.date,
    description: r.description.slice(0, 500),
    merchant: r.merchant?.slice(0, 200) || null,
    amount: r.amount,
    currency: membership.household.base_currency,
    source: "import" as const,
    bank_category: r.bankCategory?.slice(0, 100) || null,
    txn_type: r.txnType?.slice(0, 100) || null,
    payee_id: payee?.id ?? null,
    category_id: categoryId,
    scope: (payee ? scopeByPayee.get(payee.id) : null) ?? accountScope,
    suggestion_source: categoryId ? (payee?.default_category_id ? "payee" : "bank") : null,
    import_hash: createHash("sha256")
      .update(
        `${membership.household_id}|${accountId}|${r.date}|${r.amount.toFixed(2)}|${r.description.trim().toLowerCase()}`
      )
      .digest("hex"),
    created_by: userId,
    };
  });

  // dedupe within the file itself
  const seen = new Set<string>();
  const unique = records.filter((r) =>
    seen.has(r.import_hash) ? false : (seen.add(r.import_hash), true)
  );

  const { data, error } = await supabase
    .from("finance_transactions")
    .upsert(unique, {
      onConflict: "household_id,import_hash",
      ignoreDuplicates: true,
    })
    .select("id");

  if (error) return { ok: false, inserted: 0, skipped: 0, error: error.message };

  const inserted = data?.length ?? 0;
  revalidatePath("/finance");
  return { ok: true, inserted, skipped: rows.length - inserted };
}

export async function updateAccount(formData: FormData) {
  const { membership } = await requireFinance("edit");
  const supabase = await createClient();
  const { error } = await supabase
    .from("finance_accounts")
    .update({
      name: String(formData.get("name") ?? "").trim(),
      opening_balance: parseFloat(String(formData.get("opening_balance") ?? "0")) || 0,
    })
    .eq("id", String(formData.get("account_id")))
    .eq("household_id", membership.household_id);
  redirect(error ? `/finance/accounts?error=${enc(error.message)}` : "/finance/accounts?saved=1");
}

/**
 * Split finances: who an account belongs to and who can see it.
 * Only the household owner or the account's current owner may change this.
 * RLS backs it up: a private account is invisible (and untouchable) to
 * everyone except its owner, so once handed over it's truly theirs.
 */
export async function setAccountOwnership(formData: FormData) {
  const { membership, userId } = await requireFinance("edit");
  const supabase = await createClient();
  const accountId = String(formData.get("account_id"));
  const ownerUserId = String(formData.get("owner_user_id") || "") || null; // "" = whole family
  const visibility = String(formData.get("visibility")) === "private" ? "private" : "shared";

  const { data: acc } = await supabase
    .from("finance_accounts")
    .select("owner_user_id")
    .eq("id", accountId)
    .eq("household_id", membership.household_id)
    .maybeSingle();
  if (!acc) redirect(`/finance/accounts?error=${enc("Account not found")}`);
  if (membership.role !== "owner" && acc!.owner_user_id !== userId)
    redirect(`/finance/accounts?error=${enc("Only the household owner or the account's owner can change this")}`);
  if (visibility === "private" && !ownerUserId)
    redirect(`/finance/accounts?error=${enc("A private account needs an owner — pick whose it is first")}`);
  if (ownerUserId) {
    const { data: member } = await supabase
      .from("household_members")
      .select("user_id")
      .eq("household_id", membership.household_id)
      .eq("user_id", ownerUserId)
      .maybeSingle();
    if (!member) redirect(`/finance/accounts?error=${enc("That person isn't a member of this household")}`);
  }

  const { error } = await supabase
    .from("finance_accounts")
    .update({ owner_user_id: ownerUserId, visibility })
    .eq("id", accountId)
    .eq("household_id", membership.household_id);
  revalidatePath("/finance");
  redirect(error ? `/finance/accounts?error=${enc(error.message)}` : "/finance/accounts?saved=1");
}

/** Owner deletes directly (transactions cascade). Non-owners must request. */
export async function deleteAccount(formData: FormData) {
  const { membership } = await requireFinance("edit");
  if (membership.role !== "owner")
    redirect(`/finance/accounts?error=${enc("Only the household owner can delete accounts — use Request deletion instead")}`);
  const supabase = await createClient();
  const accountId = String(formData.get("account_id"));
  await supabase
    .from("finance_accounts")
    .delete()
    .eq("id", accountId)
    .eq("household_id", membership.household_id);
  redirect(`/finance/accounts?saved=${enc("Account and its transactions deleted")}`);
}

/** Tracey-PO-style: a member asks, the owner approves. */
export async function requestAccountDeletion(formData: FormData) {
  const { membership } = await requireFinance("edit");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const accountId = String(formData.get("account_id"));
  const { data: acc } = await supabase
    .from("finance_accounts")
    .update({ deletion_requested_by: user!.id, deletion_requested_at: new Date().toISOString() })
    .eq("id", accountId)
    .eq("household_id", membership.household_id)
    .select("name")
    .maybeSingle();

  // nudge the owner's devices
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const { sendWebPush, pushConfigured } = await import("@/lib/web-push");
    if (pushConfigured() && acc) {
      const admin = createAdminClient();
      const { data: owners } = await admin
        .from("household_members")
        .select("user_id")
        .eq("household_id", membership.household_id)
        .eq("role", "owner");
      const ownerIds = (owners ?? []).map((o) => o.user_id).filter((id) => id !== user!.id);
      if (ownerIds.length > 0) {
        const { data: subs } = await admin
          .from("push_subscriptions")
          .select("endpoint, p256dh, auth")
          .in("user_id", ownerIds);
        await Promise.allSettled(
          (subs ?? []).map((sub) =>
            sendWebPush(sub, {
              title: "Deletion request",
              body: `${membership.display_name ?? "A member"} asked to delete the account "${acc.name}"`,
              url: "/finance/accounts",
              tag: "nestly-account-deletion",
            })
          )
        );
      }
    }
  } catch {
    /* best effort */
  }
  redirect(`/finance/accounts?saved=${enc("Deletion requested — the owner has been notified")}`);
}

export async function cancelAccountDeletion(formData: FormData) {
  const { membership } = await requireFinance("edit");
  const supabase = await createClient();
  await supabase
    .from("finance_accounts")
    .update({ deletion_requested_by: null, deletion_requested_at: null })
    .eq("id", String(formData.get("account_id")))
    .eq("household_id", membership.household_id);
  redirect(`/finance/accounts?saved=${enc("Request dismissed")}`);
}
