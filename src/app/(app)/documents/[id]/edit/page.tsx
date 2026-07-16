import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/module-guard";
import { DocumentForm, type DocumentFormInitial } from "@/components/document-form";

export const maxDuration = 120;

export default async function EditDocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { membership } = await requireModule("documents", "edit");
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
      .order("created_at"),
  ]);
  if (!doc) notFound();

  const initial: DocumentFormInitial = {
    id: doc.id,
    title: doc.title,
    doc_type: doc.doc_type,
    provider: doc.provider,
    reference_no: doc.reference_no,
    notes: doc.notes,
    start_date: doc.start_date,
    expiry_date: doc.expiry_date,
    storage_path: doc.storage_path,
    obligations: (obligations ?? []).map((o) => ({
      kind: o.kind,
      amount: o.amount !== null ? Number(o.amount) : null,
      frequency: o.frequency,
      next_due_date: o.next_due_date,
      interest_rate: o.interest_rate !== null ? Number(o.interest_rate) : null,
      balloon_amount: o.balloon_amount !== null ? Number(o.balloon_amount) : null,
      balloon_date: o.balloon_date,
    })),
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href={`/documents/${doc.id}`} className="text-xs text-stone-400 hover:underline">
          ← {doc.title}
        </Link>
        <h1 className="text-2xl font-semibold">Edit document</h1>
      </div>
      <DocumentForm householdId={membership.household_id} initial={initial} />
    </div>
  );
}
