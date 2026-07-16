"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireFinance, monthBounds, shiftMonth } from "@/lib/finance";

export type RecurringSpend = {
  payee: string;
  category: string | null;
  occurrences: number;
  monthsSeen: number;
  avgAmount: number; // per occurrence, positive
  cadence: "weekly" | "fortnightly" | "monthly";
  estMonthly: number; // positive
  nonEssential: boolean;
};

export type ReviewStats = {
  monthKey: string;
  monthLabel: string;
  currency: string;
  income: number;
  expense: number; // total spend as a positive number
  net: number;
  byCategory: { name: string; spend: number; budget: number | null; over: number }[];
  recurring: RecurringSpend[];
  movers: { name: string; thisMonth: number; lastMonth: number; delta: number }[];
  goals: {
    name: string;
    icon: string | null;
    target: number;
    saved: number;
    targetDate: string | null;
    achieved: boolean;
  }[];
  overspendTotal: number;
  recurringNonEssentialTotal: number;
  potentialSavings: number;
  generatedAt: string;
};

const NON_ESSENTIAL = /subscription|entertainment|dining|takeaway|take-away|streaming|coffee|treats?|hobb|gaming|games/i;

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Builds the month's honest aggregates, asks Claude for a warm plain-English
 * review, and upserts it into finance_reviews. Env-gated on ANTHROPIC_API_KEY.
 */
export async function generateReview(
  monthKey: string
): Promise<{ ok: boolean; error?: string }> {
  const { membership } = await requireFinance("edit");
  const supabase = await createClient();
  const hid = membership.household_id;
  const currency = membership.household.base_currency;

  const month = monthBounds(monthKey);
  const prev = monthBounds(shiftMonth(month.key, -1));
  const windowStart = monthBounds(shiftMonth(month.key, -2)).start; // review month + 2 before

  const [
    { data: monthTxns },
    { data: prevTxns },
    { data: windowTxns },
    { data: categories },
    { data: budgets },
    { data: payees },
    { data: goals },
  ] = await Promise.all([
    supabase
      .from("finance_transactions")
      .select("amount, category_id")
      .eq("household_id", hid)
      .eq("is_transfer", false)
      .gte("posted_at", month.start)
      .lte("posted_at", month.end),
    supabase
      .from("finance_transactions")
      .select("amount, category_id")
      .eq("household_id", hid)
      .eq("is_transfer", false)
      .gte("posted_at", prev.start)
      .lte("posted_at", prev.end),
    supabase
      .from("finance_transactions")
      .select("amount, payee_id, category_id, posted_at")
      .eq("household_id", hid)
      .eq("is_transfer", false)
      .not("payee_id", "is", null)
      .lt("amount", 0)
      .gte("posted_at", windowStart)
      .lte("posted_at", month.end),
    supabase
      .from("finance_categories")
      .select("id, name, kind")
      .eq("household_id", hid),
    supabase.from("finance_budgets").select("category_id, amount").eq("household_id", hid),
    supabase.from("finance_payees").select("id, name").eq("household_id", hid),
    supabase
      .from("finance_goals")
      .select("name, icon, target_amount, saved_amount, target_date, achieved_at")
      .eq("household_id", hid)
      .order("created_at"),
  ]);

  if (!monthTxns || monthTxns.length === 0)
    return { ok: false, error: `Nothing to review — no transactions in ${month.label} yet.` };

  const catName = new Map((categories ?? []).map((c) => [c.id, c.name]));
  const budgetByCat = new Map((budgets ?? []).map((b) => [b.category_id, Number(b.amount)]));
  const payeeName = new Map((payees ?? []).map((p) => [p.id, p.name]));

  // ---- income / expense / net ---------------------------------------------
  let income = 0;
  let spend = 0; // negative
  for (const t of monthTxns) {
    const a = Number(t.amount);
    if (a > 0) income += a;
    else spend += a;
  }
  const expense = -spend;
  const net = income + spend;

  // ---- spend by category vs budget ----------------------------------------
  const spendByCat = new Map<string, number>(); // positive spend
  for (const t of monthTxns) {
    const a = Number(t.amount);
    if (a >= 0) continue;
    const key = t.category_id ?? "uncategorised";
    spendByCat.set(key, (spendByCat.get(key) ?? 0) + -a);
  }
  const byCategory = [...spendByCat.entries()]
    .map(([id, s]) => {
      const budget = id === "uncategorised" ? null : (budgetByCat.get(id) ?? null);
      return {
        name: id === "uncategorised" ? "Uncategorised" : (catName.get(id) ?? "Unknown"),
        spend: round2(s),
        budget,
        over: budget !== null ? round2(Math.max(0, s - budget)) : 0,
      };
    })
    .sort((a, b) => b.spend - a.spend);
  const overspendTotal = round2(byCategory.reduce((s, c) => s + c.over, 0));

  // ---- recurring spends: same payee, amount within ±12%, seen in ≥2 months --
  const byPayee = new Map<string, { amount: number; month: string; category_id: string | null }[]>();
  for (const t of windowTxns ?? []) {
    const arr = byPayee.get(t.payee_id!) ?? [];
    arr.push({ amount: -Number(t.amount), month: String(t.posted_at).slice(0, 7), category_id: t.category_id });
    byPayee.set(t.payee_id!, arr);
  }
  const recurring: RecurringSpend[] = [];
  for (const [pid, txns] of byPayee) {
    if (txns.length < 2) continue;
    const sorted = [...txns].sort((a, b) => a.amount - b.amount);
    const median = sorted[Math.floor(sorted.length / 2)].amount;
    const cluster = txns.filter((t) => Math.abs(t.amount - median) <= median * 0.12);
    const monthsSeen = new Set(cluster.map((t) => t.month)).size;
    if (cluster.length < 2 || monthsSeen < 2) continue;

    const avgAmount = cluster.reduce((s, t) => s + t.amount, 0) / cluster.length;
    const perMonth = cluster.length / monthsSeen;
    const cadence: RecurringSpend["cadence"] =
      perMonth >= 3.5 ? "weekly" : perMonth >= 1.75 ? "fortnightly" : "monthly";
    const estMonthly =
      cadence === "weekly" ? avgAmount * 4.33 : cadence === "fortnightly" ? avgAmount * 2.17 : avgAmount;

    // modal category of the clustered transactions
    const counts = new Map<string, number>();
    for (const t of cluster)
      if (t.category_id) counts.set(t.category_id, (counts.get(t.category_id) ?? 0) + 1);
    const modalCat = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const categoryName = modalCat ? (catName.get(modalCat) ?? null) : null;

    recurring.push({
      payee: payeeName.get(pid) ?? "Unknown",
      category: categoryName,
      occurrences: cluster.length,
      monthsSeen,
      avgAmount: round2(avgAmount),
      cadence,
      estMonthly: round2(estMonthly),
      nonEssential: categoryName !== null && NON_ESSENTIAL.test(categoryName),
    });
  }
  recurring.sort((a, b) => b.estMonthly - a.estMonthly);
  const recurringNonEssentialTotal = round2(
    recurring.filter((r) => r.nonEssential).reduce((s, r) => s + r.estMonthly, 0)
  );

  // ---- top 5 movers vs previous month (expense categories) -----------------
  const prevSpendByCat = new Map<string, number>();
  for (const t of prevTxns ?? []) {
    const a = Number(t.amount);
    if (a >= 0) continue;
    const key = t.category_id ?? "uncategorised";
    prevSpendByCat.set(key, (prevSpendByCat.get(key) ?? 0) + -a);
  }
  const moverKeys = new Set([...spendByCat.keys(), ...prevSpendByCat.keys()]);
  const movers = [...moverKeys]
    .map((id) => {
      const thisMonth = round2(spendByCat.get(id) ?? 0);
      const lastMonth = round2(prevSpendByCat.get(id) ?? 0);
      return {
        name: id === "uncategorised" ? "Uncategorised" : (catName.get(id) ?? "Unknown"),
        thisMonth,
        lastMonth,
        delta: round2(thisMonth - lastMonth),
      };
    })
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 5);

  // ---- goals ----------------------------------------------------------------
  const goalStats = (goals ?? []).map((g) => ({
    name: g.name,
    icon: g.icon,
    target: Number(g.target_amount),
    saved: Number(g.saved_amount),
    targetDate: g.target_date,
    achieved: !!g.achieved_at,
  }));

  const potentialSavings = round2(recurringNonEssentialTotal + overspendTotal);

  const stats: ReviewStats = {
    monthKey: month.key,
    monthLabel: month.label,
    currency,
    income: round2(income),
    expense: round2(expense),
    net: round2(net),
    byCategory,
    recurring,
    movers,
    goals: goalStats,
    overspendTotal,
    recurringNonEssentialTotal,
    potentialSavings,
    generatedAt: new Date().toISOString(),
  };

  // ---- ask Claude for the warm write-up ------------------------------------
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key)
    return { ok: false, error: "The monthly review needs ANTHROPIC_API_KEY set on the server." };

  const prompt = `You are the friendly money helper inside Nestly, a family-hub app. Write this family's monthly finance review for ${month.label} from the aggregates below. Warm, plain English, Apple-simple — short sentences, no jargon, no lecturing. Speak to the family as "you". Currency is ${currency}; write amounts like $1,234 (round to whole dollars unless cents matter).

HARD RULE: never recommend specific financial products, banks, loans, credit cards, investments, insurance products, or switching providers of any financial product. Do not suggest "shop around for a better rate" or similar. Only discuss the family's own spending patterns, subscriptions, budgets and goals.

Amounts in the data are aggregates: income/expense/net for the month, spend per category with budgets, recurring spends detected over the last 3 months with estimated monthly cost, the biggest category movers vs last month, and the family's savings goals.

Write markdown with exactly these four sections:

## What went well
2-4 warm, specific observations grounded in the numbers (under-budget categories, spending that dropped, income vs spend, goal progress).

## Worth a look
The recurring/subscription audit. List notable recurring spends with their estimated monthly $ cost (especially the non-essential ones), and any categories over budget with the overspend amount. Honest but kind — these are options, not orders.

## Your plan for next month
3-5 concrete actions with dollar figures, drawn only from the data (e.g. "Trim X to its $Y budget — that's $Z back"). Open with a one-line headline of the total potential savings: about $${Math.round(potentialSavings)}/month.

## Your goals
Progress on each goal, and what putting the potential savings toward them would do to their timelines (months saved, roughly). If there are no goals, gently suggest setting one up in Savings goals.

Keep the whole review under 450 words. No preamble before the first heading, no sign-off after the last section.

DATA:
${JSON.stringify(stats)}`;

  let content = "";
  let stopReason = "";
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 3000,
        messages: [{ role: "user", content: [{ type: "text", text: prompt }] }],
      }),
    });
    if (!res.ok) return { ok: false, error: `The review writer is unavailable right now (${res.status}) — try again in a minute.` };
    const data = (await res.json()) as {
      content?: { type: string; text?: string }[];
      stop_reason?: string;
    };
    // the model may lead with non-text blocks (e.g. thinking) — take ALL text blocks
    content = (data.content ?? [])
      .filter((b) => b.type === "text" && b.text)
      .map((b) => b.text)
      .join("\n")
      .trim();
    stopReason = data.stop_reason ?? "";
  } catch {
    return { ok: false, error: "Couldn't reach the review writer — check the connection and try again." };
  }
  if (!content)
    return {
      ok: false,
      error: `The review came back empty (${stopReason || "no text in reply"}) — try again.`,
    };

  const { error } = await supabase.from("finance_reviews").upsert(
    {
      household_id: hid,
      month_key: month.key,
      content,
      potential_savings: potentialSavings,
      stats,
      created_at: new Date().toISOString(),
    },
    { onConflict: "household_id,month_key" }
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath("/finance/review");
  return { ok: true };
}

/** Form-facing wrapper for the Generate/Refresh button. */
export async function generateReviewAction(formData: FormData) {
  const monthKey = String(formData.get("m") || monthBounds().key);
  const result = await generateReview(monthKey);
  redirect(
    result.ok
      ? `/finance/review?m=${monthKey}&saved=1`
      : `/finance/review?m=${monthKey}&error=${encodeURIComponent(result.error ?? "Something went wrong")}`
  );
}
