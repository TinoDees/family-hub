import Link from "next/link";
import { requireModule } from "@/lib/module-guard";
import { BookUploader } from "@/components/book-uploader";

export default async function LibraryUploadPage() {
  const { membership } = await requireModule("library", "edit");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/library" className="text-sm text-stone-400 hover:text-stone-600">
          ← Books
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">📚 Add a book</h1>
        <p className="mt-1 text-sm text-stone-500">
          Upload a DRM-free e-book, PDF or audiobook you own — the whole family can read
          or listen, and everyone keeps their own place.
        </p>
      </div>
      <BookUploader householdId={membership.household_id} />
    </div>
  );
}
