import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireFinance, formatMoney, monthBounds, shiftMonth } from "@/lib/finance";
import { addGoal, updateGoal, deleteGoal, addToGoal } from "@/lib/actions/goals";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { inputCls } from "@/components/auth-card";

type Goal = {
  id: string;
  name: string;
  icon: string | null;
  target_amount: number;
  saved_amount: number;
  target_date: string | null;
  notes: string | null;
  achieved_at: string | null;
};

/** Whole months from today until `date` (fractional, floor at 0). */
function monthsUntil(date: string): number {
  const ms = new Date(date + "T00:00:00").getTime() - Date.now();
  return Math.max(0, ms / (1000 * 60 * 60 * 24 * 30.44));
}

function planLine(goal: Goal, avgNet: number, currency: string): { text: string; tone: "good" | "warm" | "muted" } {
  const remaining = Number(goal.target_amount) - Number(goal.saved_amount);
  if (remaining <= 0) return { text: "Done and dusted — this one's in the bank.", tone: "good" };
  if (!goal.target_date)
    return {
      text: `${formatMoney(remaining, currency)} to go — set a target date and we'll work out the monthly amount.`,
      tone: "muted",
    };
  const months = monthsUntil(goal.target_date);
  const dateLabel = new Date(goal.target_date + "T00:00:00").toLocaleDateString("en-AU", {
    month: "long",
    year: "numeric",
  });
  if (months < 0.5)
    return {
      text: `${formatMoney(remaining, currency)} to go and the target date is here — nudge the date out or make a final push.`,
      tone: "warm",
    };
  const required = remaining / Math.max(months, 1);
  if (avgNet >= required)
    return {
      text: `On track — setting aside ${formatMoney(required, currency)} a month gets you there by ${dateLabel}, and lately your family has had about ${formatMoney(avgNet, currency)} a month left over.`,
      tone: "good",
    };
  const gap = required - Math.max(avgNet, 0);
  return {
    text: `To land this by ${dateLabel} you'd need ${formatMoney(required, currency)} a month — about ${formatMoney(gap, currency)} more than what's typically left over. Small trims add up.`,
    tone: "warm",
  };
}

export default async function GoalsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { membership, access } = await requireFinance("view");
  const { error, saved } = await searchParams;
  const currency = membership.household.base_currency;
  const canEdit = access === "edit";

  const supabase = await createClient();

  // average monthly net over the last 3 FULL months (signed amounts: income + spend)
  const thisMonth = monthBounds().key;
  const windowStart = monthBounds(shiftMonth(thisMonth, -3)).start;
  const windowEnd = monthBounds(shiftMonth(thisMonth, -1)).end;

  const [{ data: goals }, { data: recentTxns }] = await Promise.all([
    supabase
      .from("finance_goals")
      .select("id, name, icon, target_amount, saved_amount, target_date, notes, achieved_at")
      .eq("household_id", membership.household_id)
      .order("achieved_at", { ascending: true, nullsFirst: true })
      .order("created_at"),
    supabase
      .from("finance_transactions")
      .select("amount")
      .eq("household_id", membership.household_id)
      .eq("is_transfer", false)
      .eq("scope", "household") // goal maths runs on the family's money, not personal spending
      .gte("posted_at", windowStart)
      .lte("posted_at", windowEnd),
  ]);

  const avgNet = (recentTxns ?? []).reduce((s, t) => s + Number(t.amount), 0) / 3;
  const totalSaved = (goals ?? []).reduce((s, g) => s + Number(g.saved_amount), 0);
  const totalTarget = (goals ?? []).reduce((s, g) => s + Number(g.target_amount), 0);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/finance" className="text-xs text-stone-400 hover:underline">← Finance</Link>
          <h1 className="text-2xl font-semibold">Savings goals</h1>
        </div>
        {(goals ?? []).length > 0 && (
          <div className="text-right text-sm text-stone-500">
            <span className="font-semibold text-teal-700">{formatMoney(totalSaved, currency)}</span> saved
            of {formatMoney(totalTarget, currency)} across {goals!.length} goal{goals!.length === 1 ? "" : "s"}
          </div>
        )}
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {saved && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {saved === "1" ? "Saved." : saved}
        </p>
      )}

      {(recentTxns ?? []).length > 0 && (
        <p className="rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-500">
          Over the last three full months, your family typically had{" "}
          <span className={`font-semibold ${avgNet >= 0 ? "text-teal-700" : "text-red-600"}`}>
            {formatMoney(avgNet, currency)}
          </span>{" "}
          a month left after spending. That&apos;s what the goal maths below compares against.
        </p>
      )}

      {(goals ?? []).length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-300 bg-white p-8 text-center text-sm text-stone-400">
          No goals yet — a holiday, a rainy-day fund, a new bike. Add the first one below.
        </p>
      ) : (
        <div className="space-y-4">
          {(goals as Goal[]).map((g) => {
            const target = Number(g.target_amount);
            const savedAmt = Number(g.saved_amount);
            const pct = target > 0 ? Math.min(100, Math.round((savedAmt / target) * 100)) : 0;
            const achieved = !!g.achieved_at || savedAmt >= target;
            const plan = planLine(g, avgNet, currency);
            return (
              <div key={g.id} className="rounded-xl border border-stone-200 bg-white p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl leading-none">{g.icon || "🎯"}</span>
                    <div>
                      <div className="flex items-center gap-2 font-medium">
                        {g.name}
                        {achieved && (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                            Achieved 🎉
                          </span>
                        )}
                      </div>
                      {g.target_date && !achieved && (
                        <div className="text-xs text-stone-400">
                          by {new Date(g.target_date + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-semibold tabular-nums text-teal-700">{pct}%</div>
                    <div className="text-xs text-stone-400">
                      saved {formatMoney(savedAmt, currency)} of {formatMoney(target, currency)}
                    </div>
                  </div>
                </div>

                <div className="mt-4 h-4 overflow-hidden rounded-full bg-stone-100">
                  <div
                    className={`h-full rounded-full transition-all ${achieved ? "bg-emerald-500" : "bg-teal-500"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>

                {!achieved && (
                  <p
                    className={`mt-3 text-sm ${
                      plan.tone === "good" ? "text-emerald-700" : plan.tone === "warm" ? "text-amber-700" : "text-stone-500"
                    }`}
                  >
                    {plan.text}
                  </p>
                )}
                {g.notes && <p className="mt-2 text-xs text-stone-400">{g.notes}</p>}

                {canEdit && (
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 pt-3">
                    {!achieved ? (
                      <form action={addToGoal} className="flex items-center gap-2">
                        <input type="hidden" name="goal_id" value={g.id} />
                        <input
                          name="amount"
                          type="number"
                          step="0.01"
                          placeholder="Amount"
                          className={`${inputCls} w-28`}
                          required
                        />
                        <button className="rounded-lg bg-teal-600 px-3 py-2 text-xs font-medium text-white hover:bg-teal-700">
                          Add to goal
                        </button>
                      </form>
                    ) : (
                      <span className="text-xs text-stone-400">
                        Reached {g.achieved_at && new Date(g.achieved_at).toLocaleDateString("en-AU")}
                      </span>
                    )}

                    <details>
                      <summary className="cursor-pointer text-xs text-stone-400 hover:text-stone-600">Edit</summary>
                      <form action={updateGoal} className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <input type="hidden" name="goal_id" value={g.id} />
                        <div className="col-span-2">
                          <label className="mb-1 block text-[10px] font-medium uppercase text-stone-400">Name</label>
                          <input name="name" defaultValue={g.name} className={inputCls} required />
                        </div>
                        <div>
                          <label className="mb-1 block text-[10px] font-medium uppercase text-stone-400">Emoji</label>
                          <input name="icon" defaultValue={g.icon ?? ""} className={inputCls} placeholder="🎯" />
                        </div>
                        <div>
                          <label className="mb-1 block text-[10px] font-medium uppercase text-stone-400">Target</label>
                          <input name="target_amount" type="number" step="0.01" min="0.01" defaultValue={target} className={inputCls} required />
                        </div>
                        <div>
                          <label className="mb-1 block text-[10px] font-medium uppercase text-stone-400">Target date</label>
                          <input name="target_date" type="date" defaultValue={g.target_date ?? ""} className={inputCls} />
                        </div>
                        <div className="col-span-2 sm:col-span-3">
                          <label className="mb-1 block text-[10px] font-medium uppercase text-stone-400">Notes</label>
                          <input name="notes" defaultValue={g.notes ?? ""} className={inputCls} />
                        </div>
                        <div className="col-span-2 flex items-end gap-2 sm:col-span-4">
                          <button className="rounded-lg border border-stone-300 px-3 py-2 text-xs font-medium hover:bg-stone-100">
                            Save changes
                          </button>
                        </div>
                      </form>
                      <form action={deleteGoal} className="mt-2">
                        <input type="hidden" name="goal_id" value={g.id} />
                        <ConfirmSubmit
                          label="Delete goal"
                          confirmMessage={`Delete "${g.name}"? The money itself isn't touched — this only removes the goal tracker.`}
                          className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                        />
                      </form>
                    </details>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {canEdit && (
        <details className="rounded-xl border border-stone-200 bg-white">
          <summary className="cursor-pointer px-5 py-4 text-sm font-medium text-teal-700">+ Add a goal</summary>
          <form action={addGoal} className="grid grid-cols-2 gap-3 border-t border-stone-100 p-5 sm:grid-cols-4">
            <div className="col-span-2">
              <label className="mb-1 block text-[10px] font-medium uppercase text-stone-400">Name</label>
              <input name="name" className={inputCls} placeholder="Bali trip, rainy-day fund…" required />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-medium uppercase text-stone-400">Emoji</label>
              <input name="icon" className={inputCls} placeholder="🏝️" />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-medium uppercase text-stone-400">Target amount</label>
              <input name="target_amount" type="number" step="0.01" min="0.01" className={inputCls} required />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-medium uppercase text-stone-400">Already saved</label>
              <input name="saved_amount" type="number" step="0.01" min="0" className={inputCls} placeholder="0" />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-medium uppercase text-stone-400">Target date</label>
              <input name="target_date" type="date" className={inputCls} />
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-[10px] font-medium uppercase text-stone-400">Notes</label>
              <input name="notes" className={inputCls} placeholder="Optional" />
            </div>
            <div className="col-span-2 flex items-end sm:col-span-4">
              <button className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700">
                Add goal
              </button>
            </div>
          </form>
        </details>
      )}

      <p className="text-xs text-stone-400">
        Goals track money you&apos;ve set aside — adding to a goal here doesn&apos;t move money between
        your real accounts.
      </p>
    </div>
  );
}
