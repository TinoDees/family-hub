import Link from "next/link";
import { requireModule } from "@/lib/module-guard";
import { DocumentForm } from "@/components/document-form";

// PDF extraction can take a little while
export const maxDuration = 120;

export default async function NewDocumentPage() {
  const { membership } = await requireModule("documents", "edit");
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/documents" className="text-xs text-stone-400 hover:underline">
          ← Documents
        </Link>
        <h1 className="text-2xl font-semibold">Add a document</h1>
        <p className="mt-1 text-sm text-stone-500">
          Scan it or upload it, then let Nestly read the boring bits for you — you get the
          final say before anything is saved.
        </p>
      </div>
      <DocumentForm householdId={membership.household_id} />
    </div>
  );
}
