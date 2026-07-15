"use server";

import { createHash } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireFinance } from "@/lib/finance";

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
  await supabase
    .from("finance_transactions")
    .update({ category_id: String(formData.get("category_id") || "") || null })
    .eq("id", String(formData.get("txn_id")))
    .eq("household_id", membership.household_id);
  revalidatePath("/finance");
  redirect(`/finance/transactions?m=${formData.get("m") ?? ""}`);
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
  const records = rows.map((r) => ({
    household_id: membership.household_id,
    account_id: accountId,
    posted_at: r.date,
    description: r.description.slice(0, 500),
    merchant: r.merchant?.slice(0, 200) || null,
    amount: r.amount,
    currency: membership.household.base_currency,
    source: "import" as const,
    import_hash: createHash("sha256")
      .update(
        `${membership.household_id}|${accountId}|${r.date}|${r.amount.toFixed(2)}|${r.description.trim().toLowerCase()}`
      )
      .digest("hex"),
    created_by: userId,
  }));

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
