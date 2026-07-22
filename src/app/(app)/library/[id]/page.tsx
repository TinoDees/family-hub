import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/module-guard";
import { deleteLibraryBook } from "@/lib/actions/library";
import { AudiobookPlayer } from "@/components/audiobook-player";
import { DeleteBookButton } from "@/components/delete-book-button";

const TYPE_META = {
  epub: { icon: "📖", label: "E-book" },
  pdf: { icon: "📄", label: "PDF" },
  audio: { icon: "🎧", label: "Audiobook" },
} as const;

const fmtSize = (bytes: number | null) =>
  !bytes ? null : bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;

export default async function LibraryBookPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { membership, access, userId } = await requireModule("library", "view");

  const supabase = await createClient();
  const [{ data: book }, { data: members }] = await Promise.all([
    supabase
      .from("library_books")
      .select("id, title, author, file_type, storage_path, cover_path, file_bytes, owner_id, created_at")
      .eq("id", id)
      .eq("household_id", membership.household_id)
      .maybeSingle(),
    supabase
      .from("household_members")
      .select("user_id, display_name")
      .eq("household_id", membership.household_id),
  ]);
  if (!book) notFound();

  const { data: progress } = await supabase
    .from("library_progress")
    .select("position, percent")
    .eq("book_id", book.id)
    .eq("user_id", userId)
    .maybeSingle();

  const type = TYPE_META[book.file_type as keyof typeof TYPE_META];
  const uploader =
    (members ?? []).find((m) => m.user_id === book.owner_id)?.display_name ?? null;

  // Signed URLs (private bucket): cover for display; the file itself for
  // PDF open / audio playback. The EPUB reader page signs its own.
  const signPaths = [
    ...(book.cover_path ? [book.cover_path] : []),
    ...(book.file_type !== "epub" ? [book.storage_path] : []),
  ];
  const urls = new Map<string, string>();
  if (signPaths.length > 0) {
    const { data: signed } = await supabase.storage
      .from("library")
      .createSignedUrls(signPaths, 21600);
    for (const s of signed ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
  }
  const coverUrl = book.cover_path ? urls.get(book.cover_path) : undefined;
  const fileUrl = urls.get(book.storage_path);

  const pct = typeof progress?.percent === "number" ? Number(progress.percent) : null;
  const audioSeconds =
    book.file_type === "audio" && progress?.position ? parseFloat(progress.position) : 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/library" className="text-sm text-stone-400 hover:text-stone-600">
        ← Books
      </Link>

      <div className="rounded-xl border border-stone-200 bg-white p-6">
        <div className="flex flex-col gap-6 sm:flex-row">
          <div className="w-36 shrink-0 self-center sm:self-start">
            <div className="aspect-[2/3] overflow-hidden rounded-lg border border-stone-200 bg-stone-100">
              {coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={coverUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-4xl">
                  {type.icon}
                </div>
              )}
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium text-stone-400">
              {type.icon} {type.label}
            </div>
            <h1 className="mt-1 text-2xl font-semibold leading-snug">{book.title}</h1>
            {book.author && <p className="mt-1 text-stone-500">{book.author}</p>}

            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-400">
              {uploader && <span>Added by {uploader}</span>}
              {fmtSize(book.file_bytes) && <span>{fmtSize(book.file_bytes)}</span>}
              {pct !== null && pct > 0 && (
                <span className="text-teal-600">
                  {Math.round(pct)}% {book.file_type === "audio" ? "listened" : "read"}
                </span>
              )}
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              {book.file_type === "epub" && (
                <Link
                  href={`/library/${book.id}/read`}
                  className="rounded-lg bg-stone-900 px-5 py-2 text-sm font-medium text-white hover:bg-stone-700"
                >
                  {pct !== null && pct > 0 ? "📖 Continue reading" : "📖 Start reading"}
                </Link>
              )}
              {book.file_type === "pdf" && fileUrl && (
                <a
                  href={fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg bg-stone-900 px-5 py-2 text-sm font-medium text-white hover:bg-stone-700"
                >
                  📄 Open PDF
                </a>
              )}
              {access === "edit" && (
                <form action={deleteLibraryBook}>
                  <input type="hidden" name="book_id" value={book.id} />
                  <DeleteBookButton />
                </form>
              )}
            </div>
          </div>
        </div>

        {book.file_type === "audio" && fileUrl && (
          <div className="mt-6 border-t border-stone-100 pt-5">
            <AudiobookPlayer bookId={book.id} src={fileUrl} initialSeconds={audioSeconds} />
          </div>
        )}
      </div>

      <p className="text-xs text-stone-400">
        Everyone in the family keeps their own reading position — yours is saved
        automatically.
      </p>
    </div>
  );
}
