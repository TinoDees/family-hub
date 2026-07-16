import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/module-guard";
import {
  DOC_GROUPS,
  DOC_TYPES,
  docType,
  fmtMoney,
  fmtShortDate,
  frequencyWord,
  daysUntil,
} from "@/lib/document-types";

type ObligationRow = {
  kind: string | null;
  amount: number | null;
  frequency: string | null;
  next_due_date: string | null;
};

type DocRow = {
  id: string;
  title: string;
  doc_type: string;
  provider: string | null;
  expiry_date: string | null;
  storage_path: string | null;
  obligations: ObligationRow[];
};

/** The obligation worth putting on the card: soonest due first, else biggest. */
function keyObligation(obs: ObligationRow[]): ObligationRow | null {
  const withAmount = obs.filter((o) => o.amount !== null);
  if (withAmount.length === 0) return null;
  const dated = withAmount
    .filter((o) => o.next_due_date)
    .sort((a, b) => (a.next_due_date! < b.next_due_date! ? -1 : 1));
  return dated[0] ?? withAmount.sort((a, b) => Number(b.amount) - Number(a.amount))[0];
}

function ExpiryBadge({ expiry }: { expiry: string | null }) {
  const days = daysUntil(expiry);
  if (days === null) return null;
  if (days < 0) {
    return (
      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
        Expired
      </span>
    );
  }
  if (days < 60) {
    return (
      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
        {days === 0 ? "Expires today" : `Expires in ${days} day${days === 1 ? "" : "s"}`}
      </span>
    );
  }
  return null;
}

export default async function DocumentsPage() {
  const { membership, access } = await requireModule("documents", "view");

  const supabase = await createClient();
  const { data } = await supabase
    .from("documents")
    .select(
      "id, title, doc_type, provider, expiry_date, storage_path, obligations:document_obligations(kind, amount, frequency, next_due_date)"
    )
    .eq("household_id", membership.household_id)
    .order("title");
  const docs = (data ?? []) as DocRow[];

  const groups = DOC_GROUPS.map((group) => ({
    group,
    docs: docs.filter((d) => docType(d.doc_type).group === group),
  })).filter((g) => g.docs.length > 0);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">🗂️ Documents</h1>
          <p className="mt-1 text-sm text-stone-500">
            The family paperwork — what it is, who it&apos;s with, and when money moves.
          </p>
        </div>
        {access === "edit" && (
          <Link
            href="/documents/new"
            className="rounded-lg bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-700"
          >
            + Add a document
          </Link>
        )}
      </div>

      {docs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-stone-300 bg-white p-10 text-center">
          <div className="text-3xl">🗂️</div>
          <p className="mt-3 text-sm font-medium text-stone-600">
            One safe home for the family paperwork
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm text-stone-400">
            The mortgage, the car insurance, the fridge warranty — snap a photo or upload the
            PDF, and Nestly reads out the key dates and payments for you. It&apos;ll flag things
            before they expire, so renewals never sneak up on the family again.
          </p>
          {access === "edit" && (
            <Link
              href="/documents/new"
              className="mt-4 inline-block rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700"
            >
              Add your first document
            </Link>
          )}
        </div>
      ) : (
        groups.map(({ group, docs: groupDocs }) => (
          <section key={group} className="space-y-3">
            <h2 className="text-sm font-semibold text-stone-500">{group}</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {groupDocs.map((d) => {
                const t = docType(d.doc_type);
                const ob = keyObligation(d.obligations ?? []);
                return (
                  <Link
                    key={d.id}
                    href={`/documents/${d.id}`}
                    className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-medium">
                          <span className="mr-1.5">{t.icon}</span>
                          {d.title}
                        </div>
                        {d.provider && (
                          <div className="mt-0.5 truncate text-sm text-stone-500">{d.provider}</div>
                        )}
                      </div>
                      <ExpiryBadge expiry={d.expiry_date} />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-stone-400">
                      {ob ? (
                        <span className="font-medium text-stone-600">
                          {fmtMoney(ob.amount)}
                          {ob.frequency ? ` ${frequencyWord(ob.frequency)}` : ""}
                          {ob.next_due_date ? `, next ${fmtShortDate(ob.next_due_date)}` : ""}
                        </span>
                      ) : (
                        <span>{t.label}</span>
                      )}
                      {d.storage_path && <span>📎 file attached</span>}
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        ))
      )}

      {docs.length > 0 && (
        <p className="text-xs text-stone-400">
          {DOC_TYPES.length} kinds of paperwork supported — loans, insurance, warranties,
          leases, utilities, subscriptions and more.
        </p>
      )}
    </div>
  );
}
