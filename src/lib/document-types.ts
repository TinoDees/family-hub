/**
 * Documents module — shared vocabulary for document types, obligation kinds
 * and frequencies. Pure data + formatters, safe to import from server pages,
 * server actions and client components alike.
 *
 * Keep the slugs in sync with the check constraints in
 * supabase/migrations/040_documents.sql.
 */

export type DocTypeDef = {
  slug: string;
  /** What a person would call it. */
  label: string;
  icon: string;
  /** Friendly section heading on the list page. */
  group: string;
};

export const DOC_TYPES: DocTypeDef[] = [
  { slug: "mortgage", label: "Mortgage", icon: "🏠", group: "Home & loans" },
  { slug: "loan", label: "Loan", icon: "🏦", group: "Home & loans" },
  { slug: "lease", label: "Lease / rental", icon: "🔑", group: "Home & loans" },
  { slug: "insurance", label: "Insurance", icon: "🛡️", group: "Insurance" },
  { slug: "warranty", label: "Warranty / receipt", icon: "🧾", group: "Warranties & receipts" },
  { slug: "utility", label: "Utility", icon: "💡", group: "Utilities & subscriptions" },
  { slug: "subscription", label: "Subscription", icon: "📺", group: "Utilities & subscriptions" },
  { slug: "other", label: "Something else", icon: "📄", group: "Everything else" },
];

export const DOC_TYPE_SLUGS = DOC_TYPES.map((t) => t.slug);

export function docType(slug: string | null | undefined): DocTypeDef {
  return DOC_TYPES.find((t) => t.slug === slug) ?? DOC_TYPES[DOC_TYPES.length - 1];
}

/** Group headings in display order (derived from DOC_TYPES order, de-duped). */
export const DOC_GROUPS = DOC_TYPES.map((t) => t.group).filter(
  (g, i, arr) => arr.indexOf(g) === i
);

export const OBLIGATION_KINDS = [
  { slug: "repayment", label: "Repayment" },
  { slug: "premium", label: "Premium" },
  { slug: "fee", label: "Fee" },
  { slug: "payout", label: "Payout" },
  { slug: "other", label: "Payment" },
];

export const OBLIGATION_KIND_SLUGS = OBLIGATION_KINDS.map((k) => k.slug);

export function obligationKindLabel(slug: string | null | undefined): string {
  return OBLIGATION_KINDS.find((k) => k.slug === slug)?.label ?? "Payment";
}

export const FREQUENCIES = [
  { slug: "weekly", label: "Weekly", word: "weekly" },
  { slug: "fortnightly", label: "Fortnightly", word: "fortnightly" },
  { slug: "monthly", label: "Monthly", word: "monthly" },
  { slug: "quarterly", label: "Every 3 months", word: "every 3 months" },
  { slug: "yearly", label: "Yearly", word: "yearly" },
  { slug: "one_off", label: "One-off", word: "one-off" },
];

export const FREQUENCY_SLUGS = FREQUENCIES.map((f) => f.slug);

/** "monthly", "every 3 months", "one-off" — reads naturally after an amount. */
export function frequencyWord(slug: string | null | undefined): string {
  return FREQUENCIES.find((f) => f.slug === slug)?.word ?? "";
}

/** "$482" or "$1,234.56" — drops cents when they're zero. */
export function fmtMoney(value: number | string | null | undefined): string {
  const n = Number(value);
  if (value === null || value === undefined || isNaN(n)) return "";
  const hasCents = Math.round(n * 100) % 100 !== 0;
  return (
    "$" +
    n.toLocaleString("en-AU", {
      minimumFractionDigits: hasCents ? 2 : 0,
      maximumFractionDigits: hasCents ? 2 : 0,
    })
  );
}

function parseIsoDate(iso: string | null | undefined): Date | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  const d = new Date(iso.slice(0, 10) + "T00:00:00");
  return isNaN(d.getTime()) ? null : d;
}

/** "28 Jul" (adds the year when it isn't this year). */
export function fmtShortDate(iso: string | null | undefined): string {
  const d = parseIsoDate(iso);
  if (!d) return "";
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
  return d.toLocaleDateString("en-AU", opts);
}

/** "28 July 2026" — for detail pages. */
export function fmtLongDate(iso: string | null | undefined): string {
  const d = parseIsoDate(iso);
  if (!d) return "";
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
}

/** Whole days from today until `iso` (negative = in the past). */
export function daysUntil(iso: string | null | undefined): number | null {
  const d = parseIsoDate(iso);
  if (!d) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}
