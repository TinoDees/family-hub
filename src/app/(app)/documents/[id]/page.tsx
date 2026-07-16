import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/module-guard";
import { deleteDocument } from "@/lib/actions/documents";
import { ConfirmSubmit } from "@/components/confirm-submit";
import {
  docType,
  obligationKindLabel,
  fmtMoney,
  fmtLongDate,
  fmtShortDate,
  frequencyWord,
  daysUntil,
} from "@/lib/document-types";

export default async function DocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { membership, access } = await requireModule("documents", "view");
  const { id } = await params;

  const supabase = await createClient();
  const [{ data: doc }, { data: obligations }] = await Promise.all([
    supabase
      .from("documents")
      .select("*")
      .eq("id", id)
      .eq("household_id", membership.household_id)
      .maybeSingle(),
    supabase
      .from("document_obligations")
      .select("*")
      .eq("document_id", id)
      .eq("household_id", membership.household_id)
      .order("next_due_date", { ascending: true, nullsFirst: false }),
  ]);
  if (!doc) notFound();

  let fileUrl: string | null = null;
  if (doc.storage_path) {
    const { data: signed } = await supabase.storage
      .from("documents")
      .createSignedUrl(doc.storage_path, 3600);
    fileUrl = signed?.signedUrl ?? null;
  }

  const t = docType(doc.doc_type);
  const expiryDays = daysUntil(doc.expiry_date);

  const facts: { label: string; value: string }[] = [
    { label: "What it is", value: `${t.icon} ${t.label}` },
    ...(doc.provider ? [{ label: "Who it's with", value: doc.provider }] : []),
    ...(doc.reference_no ? [{ label: "Reference", value: doc.reference_no }] : []),
    ...(doc.start_date ? [{ label: "Started", value: fmtLongDate(doc.start_date) }] : []),
    ...(doc.expiry_date
      ? [
          {
            label: expiryDays !== null && expiryDays < 0 ? "Expired" : "Expires",
            value: fmtLongDate(doc.expiry_date),
          },
        ]
      : []),
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/documents" className="text-xs text-stone-400 hover:underline">
            ← Documents
          </Link>
          <h1 className="text-2xl font-semibold">
            <span className="mr-2">{t.icon}</span>
            {doc.title}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            {expiryDays !== null && expiryDays < 0 && (
              <span className="rounded-full bg-red-100 px-2 py-0.5 font-medium text-red-700">
                Expired {fmtShortDate(doc.expiry_date)}
              </span>
            )}
            {expiryDays !== null && expiryDays >= 0 && expiryDays < 60 && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-700">
                {expiryDays === 0
                  ? "Expires today"
                  : `Expires in ${expiryDays} day${expiryDays === 1 ? "" : "s"}`}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {fileUrl && (
            <a
              href={fileUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-700"
            >
              📄 Open document
            </a>
          )}
          {access === "edit" && (
            <>
              <Link
                href={`/documents/${doc.id}/edit`}
                className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium hover:bg-stone-100"
              >
                Edit
              </Link>
              <form action={deleteDocument}>
                <input type="hidden" name="document_id" value={doc.id} />
                <ConfirmSubmit
                  label="Delete"
                  confirmMessage={`Delete "${doc.title}"? The stored file goes with it.`}
                  className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
                />
              </form>
            </>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-stone-200 bg-white p-6">
        <h2 className="mb-3 text-sm font-semibold">The details</h2>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          {facts.map((f) => (
            <div key={f.label}>
              <dt className="text-xs text-stone-400">{f.label}</dt>
              <dd className="text-sm text-stone-700">{f.value}</dd>
            </div>
          ))}
        </dl>
        {doc.notes && (
          <div className="mt-4 border-t border-stone-100 pt-3">
            <div className="text-xs text-stone-400">Notes</div>
            <p className="mt-1 whitespace-pre-wrap text-sm text-stone-700">{doc.notes}</p>
          </div>
        )}
        {!fileUrl && (
          <p className="mt-4 border-t border-stone-100 pt-3 text-xs text-stone-400">
            No file attached{access === "edit" ? " — edit this document to add a scan or PDF." : "."}
          </p>
        )}
      </div>

      <div className="rounded-xl border border-stone-200 bg-white p-6">
        <h2 className="mb-3 text-sm font-semibold">The money side</h2>
        {(obligations ?? []).length === 0 ? (
          <p className="text-sm text-stone-400">No payments recorded for this one.</p>
        ) : (
          <ul className="space-y-3">
            {(obligations ?? []).map((o) => (
              <li key={o.id} className="rounded-lg border border-stone-200 bg-stone-50 p-3">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-sm font-semibold text-stone-800">
                    {o.amount !== null
                      ? `${fmtMoney(o.amount)}${o.frequency ? ` ${frequencyWord(o.frequency)}` : ""}`
                      : obligationKindLabel(o.kind)}
                  </span>
                  {o.amount !== null && (
                    <span className="text-xs text-stone-400">{obligationKindLabel(o.kind)}</span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-500">
                  {o.next_due_date && <span>Next due {fmtLongDate(o.next_due_date)}</span>}
                  {o.interest_rate !== null && <span>{Number(o.interest_rate)}% interest</span>}
                  {o.balloon_amount !== null && (
                    <span>
                      Balloon payment of {fmtMoney(o.balloon_amount)}
                      {o.balloon_date ? ` on ${fmtLongDate(o.balloon_date)}` : ""}
                    </span>
                  )}
                </div>
                {o.notes && <p className="mt-1 text-xs text-stone-400">{o.notes}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
