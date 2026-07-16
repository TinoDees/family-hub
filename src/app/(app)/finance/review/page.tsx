import Link from "next/link";
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { requireFinance, formatMoney, monthBounds, shiftMonth } from "@/lib/finance";
import { generateReviewAction } from "@/lib/actions/review";
import { PendingButton } from "@/components/pending-button";

// the AI write-up takes ~20s — without this Vercel kills the action mid-flight
export const maxDuration = 60;

/** Inline markdown: just **bold** — enough for the review copy. */
function renderInline(text: string): ReactNode[] {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={i}>{part}</strong> : <span key={i}>{part}</span>
  );
}

/** Tiny markdown renderer — headings, bullets, paragraphs. No dependencies. */
function renderMarkdown(md: string): ReactNode[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: ReactNode[] = [];
  let bullets: string[] = [];
  let para: string[] = [];
  let key = 0;

  const flushBullets = () => {
    if (bullets.length === 0) return;
    out.push(
      <ul key={key++} className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-stone-600">
        {bullets.map((b, i) => (
          <li key={i}>{renderInline(b)}</li>
        ))}
      </ul>
    );
    bullets = [];
  };
  const flushPara = () => {
    if (para.length === 0) return;
    out.push(
      <p key={key++} className="text-sm leading-relaxed text-stone-600">
        {renderInline(para.join(" "))}
      </p>
    );
    para = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    const bullet = line.match(/^[-*]\s+(.*)$/);
    if (heading) {
      flushBullets();
      flushPara();
      out.push(
        heading[1].length <= 2 ? (
          <h2 key={key++} className="pt-2 text-base font-semibold text-stone-800">
            {renderInline(heading[2])}
          </h2>
        ) : (
          <h3 key={key++} className="pt-1 text-sm font-semibold text-stone-700">
            {renderInline(heading[2])}
          </h3>
        )
      );
    } else if (bullet) {
      flushPara();
      bullets.push(bullet[1]);
    } else if (line === "") {
      flushBullets();
      flushPara();
    } else {
      flushBullets();
      para.push(line);
    }
  }
  flushBullets();
  flushPara();
  return out;
}

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; error?: string; saved?: string }>;
}) {
  const { membership, access } = await requireFinance("view");
  const { m, error, saved } = await searchParams;
  const month = monthBounds(m);
  const currency = membership.household.base_currency;
  const canEdit = access === "edit";

  const supabase = await createClient();
  const { data: review } = await supabase
    .from("finance_reviews")
    .select("content, potential_savings, stats, created_at")
    .eq("household_id", membership.household_id)
    .eq("month_key", month.key)
    .maybeSingle();

  const savings = review ? Number(review.potential_savings ?? 0) : 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/finance" className="text-xs text-stone-400 hover:underline">← Finance</Link>
          <h1 className="text-2xl font-semibold">Monthly review</h1>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/finance/review?m=${shiftMonth(month.key, -1)}`}
            className="rounded-lg border border-stone-300 px-2.5 py-1 text-sm hover:bg-stone-100"
          >
            ←
          </Link>
          <span className="min-w-36 text-center text-sm font-medium">{month.label}</span>
          <Link
            href={`/finance/review?m=${shiftMonth(month.key, 1)}`}
            className="rounded-lg border border-stone-300 px-2.5 py-1 text-sm hover:bg-stone-100"
          >
            →
          </Link>
        </div>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {saved && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Your {month.label} review is ready.
        </p>
      )}

      {review ? (
        <>
          <div className="rounded-xl bg-teal-600 p-6 text-white shadow-sm">
            {savings > 0 ? (
              <>
                <div className="text-xs font-medium uppercase tracking-wide text-teal-100">
                  {month.label}
                </div>
                <div className="mt-1 text-2xl font-semibold">
                  We found {formatMoney(savings, currency)}/month you could put back in your pocket
                </div>
                <p className="mt-2 text-sm text-teal-100">
                  From recurring non-essential spends and categories over budget — the details are below.
                </p>
              </>
            ) : (
              <>
                <div className="text-xs font-medium uppercase tracking-wide text-teal-100">
                  {month.label}
                </div>
                <div className="mt-1 text-2xl font-semibold">Your spending looks tidy this month</div>
                <p className="mt-2 text-sm text-teal-100">
                  Nothing obvious to trim — the full picture is below.
                </p>
              </>
            )}
          </div>

          <div className="space-y-3 rounded-xl border border-stone-200 bg-white p-6">
            {renderMarkdown(review.content)}
            <p className="border-t border-stone-100 pt-3 text-[11px] text-stone-400">
              Written {new Date(review.created_at).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })} from your own transactions, budgets and goals.
            </p>
          </div>
        </>
      ) : (
        <div className="rounded-xl border border-dashed border-stone-300 bg-white p-10 text-center">
          <div className="text-3xl">📖</div>
          <p className="mt-2 text-sm text-stone-500">
            No review for {month.label} yet.
            {canEdit
              ? " Generate one and we'll read through the month for you — what went well, what's worth a look, and a plan for next month."
              : " Ask someone with finance edit access to generate it."}
          </p>
        </div>
      )}

      {canEdit && (
        <form action={generateReviewAction} className="flex justify-center">
          <input type="hidden" name="m" value={month.key} />
          <PendingButton
            pendingLabel="Reading your month… about 20 seconds"
            className="rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-teal-700"
          >
            {review ? "Refresh review" : "Generate review"}
          </PendingButton>
        </form>
      )}

      <p className="text-center text-xs text-stone-400">
        Nestly helps you see and organise your family&apos;s own spending. It doesn&apos;t provide
        financial advice and never recommends financial products. For advice about loans, insurance
        or investments, talk to a licensed adviser.
      </p>
    </div>
  );
}
