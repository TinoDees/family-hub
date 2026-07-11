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
  });
  redirect(error ? `/finance/setup?error=${enc(error.message)}` : "/finance/setup?saved=1");
}

export async function addCategory(formData: FormData) {
  const { membership } = await requireFinance("edit");
  const supabase = await createClient();
  const { error } = await supabase.from("finance_categories").insert({
    household_id: membership.household_id,
    name: String(formData.get("name") ?? "").trim(),
    icon: String(formData.get("icon") ?? "").trim() || null,
    kind: String(formData.get("kind") ?? "expense"),
  });
  redirect(error ? `/finance/setup?error=${enc(error.message)}` : "/finance/setup?saved=1");
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
