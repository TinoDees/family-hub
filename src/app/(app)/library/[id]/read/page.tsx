import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/module-guard";
import { EpubReader } from "@/components/epub-reader";

export default async function LibraryReadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { membership, userId } = await requireModule("library", "view");

  const supabase = await createClient();
  const { data: book } = await supabase
    .from("library_books")
    .select("id, title, file_type, storage_path")
    .eq("id", id)
    .eq("household_id", membership.household_id)
    .maybeSingle();
  if (!book || book.file_type !== "epub") notFound();

  const [{ data: signed }, { data: progress }] = await Promise.all([
    supabase.storage.from("library").createSignedUrl(book.storage_path, 21600),
    supabase
      .from("library_progress")
      .select("position")
      .eq("book_id", book.id)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  if (!signed?.signedUrl) notFound();

  return (
    <EpubReader
      bookId={book.id}
      title={book.title}
      url={signed.signedUrl}
      initialLocation={progress?.position ?? null}
    />
  );
}
