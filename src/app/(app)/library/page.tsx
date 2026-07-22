import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireModule } from "@/lib/module-guard";
import { googleBooksConfigured } from "@/lib/google-books";
import { GoogleShelfControls } from "@/components/google-shelf-controls";

type BookRow = {
  id: string;
  title: string;
  author: string | null;
  file_type: "epub" | "pdf" | "audio";
  cover_path: string | null;
  owner_id: string | null;
};

type GoogleRow = {
  volume_id: string;
  title: string;
  authors: string | null;
  thumbnail_url: string | null;
  info_link: string | null;
  user_id: string;
};

const TYPE_META: Record<BookRow["file_type"], { icon: string; label: string }> = {
  epub: { icon: "📖", label: "E-book" },
  pdf: { icon: "📄", label: "PDF" },
  audio: { icon: "🎧", label: "Audiobook" },
};

const BANNERS: Record<string, { tone: "ok" | "bad"; text: string }> = {
  connected: { tone: "ok", text: "Google connected — your Play Books shelf is in." },
  "connected-nosync": {
    tone: "ok",
    text: "Google connected. The first shelf sync didn't finish — hit Refresh shelf below.",
  },
  denied: { tone: "bad", text: "No worries — you can connect Google any time." },
  failed: {
    tone: "bad",
    text: "Connecting Google didn't work. Try again; if it keeps failing, remove Nestly under myaccount.google.com → Security → Third-party access, then reconnect.",
  },
  unconfigured: {
    tone: "bad",
    text: "The Google connection isn't set up yet — the Client ID and Secret are missing from the environment.",
  },
};

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ google?: string }>;
}) {
  const { membership, access, userId } = await requireModule("library", "view");
  const { google } = await searchParams;
  const banner = google ? BANNERS[google] : undefined;
  const configured = googleBooksConfigured();

  const supabase = await createClient();
  const [
    { data: bookData },
    { data: googleData },
    { data: myAccount },
    { data: progressData },
    { data: memberData },
  ] = await Promise.all([
    supabase
      .from("library_books")
      .select("id, title, author, file_type, cover_path, owner_id")
      .eq("household_id", membership.household_id)
      .order("title"),
    supabase
      .from("library_google_books")
      .select("volume_id, title, authors, thumbnail_url, info_link, user_id")
      .eq("household_id", membership.household_id)
      .order("title"),
    supabase
      .from("library_google_accounts")
      .select("google_email, last_synced_at")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.from("library_progress").select("book_id, percent").eq("user_id", userId),
    supabase
      .from("household_members")
      .select("user_id, display_name")
      .eq("household_id", membership.household_id),
  ]);

  const books = (bookData ?? []) as BookRow[];
  const gbooks = (googleData ?? []) as GoogleRow[];
  const myProgress = new Map(
    (progressData ?? []).map((p) => [p.book_id as string, p.percent as number | null])
  );
  const memberName = new Map(
    (memberData ?? []).map((m) => [m.user_id as string, (m.display_name as string) ?? "Someone"])
  );

  // Signed URLs for upload covers (private bucket)
  const coverPaths = books.map((b) => b.cover_path).filter(Boolean) as string[];
  const coverUrl = new Map<string, string>();
  if (coverPaths.length > 0) {
    const { data: signed } = await supabase.storage
      .from("library")
      .createSignedUrls(coverPaths, 3600);
    for (const s of signed ?? []) if (s.path && s.signedUrl) coverUrl.set(s.path, s.signedUrl);
  }

  // Who in the family has connected Google (safe fields only, via service role
  // — tokens stay owner-only under RLS and never reach this page).
  let connections: { user_id: string; google_email: string | null }[] = [];
  if (configured) {
    const admin = createAdminClient();
    const { data } = await admin
      .from("library_google_accounts")
      .select("user_id, google_email")
      .eq("household_id", membership.household_id);
    connections = (data ?? []) as typeof connections;
  }

  // One combined Google shelf: dedupe volumes across members, remember whose.
  const combined = new Map<string, GoogleRow & { owners: string[] }>();
  for (const g of gbooks) {
    const existing = combined.get(g.volume_id);
    const owner = memberName.get(g.user_id) ?? "Someone";
    if (existing) {
      if (!existing.owners.includes(owner)) existing.owners.push(owner);
    } else {
      combined.set(g.volume_id, { ...g, owners: [owner] });
    }
  }
  const googleShelf = Array.from(combined.values());

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">📚 Library</h1>
          <p className="mt-1 text-sm text-stone-500">
            The family bookshelf — books you&apos;ve uploaded, plus everyone&apos;s Google
            Play Books in one place.
          </p>
        </div>
        {access === "edit" && (
          <Link
            href="/library/upload"
            className="rounded-lg bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-700"
          >
            + Add a book
          </Link>
        )}
      </div>

      {banner && (
        <div
          className={`rounded-lg border px-4 py-2.5 text-sm ${
            banner.tone === "ok"
              ? "border-teal-200 bg-teal-50 text-teal-800"
              : "border-amber-200 bg-amber-50 text-amber-800"
          }`}
        >
          {banner.text}
        </div>
      )}

      {/* ── Our shelf ─────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-stone-500">
          Our shelf · {books.length} {books.length === 1 ? "book" : "books"}
        </h2>
        {books.length === 0 ? (
          <div className="rounded-xl border border-dashed border-stone-300 bg-white p-8 text-center">
            <div className="text-3xl">📚</div>
            <p className="mt-3 text-sm font-medium text-stone-600">
              No books on the family shelf yet
            </p>
            <p className="mx-auto mt-2 max-w-md text-sm text-stone-400">
              Upload DRM-free e-books (.epub), PDFs or audiobooks you own and the whole
              family can read or listen right here — with everyone keeping their own
              place in the book.
            </p>
            {access === "edit" && (
              <Link
                href="/library/upload"
                className="mt-4 inline-block rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700"
              >
                Add the first book
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {books.map((b) => {
              const meta = TYPE_META[b.file_type];
              const cover = b.cover_path ? coverUrl.get(b.cover_path) : undefined;
              const pct = myProgress.get(b.id);
              return (
                <Link
                  key={b.id}
                  href={`/library/${b.id}`}
                  className="group overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="relative aspect-[2/3] bg-stone-100">
                    {cover ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={cover}
                        alt=""
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-3 text-center">
                        <span className="text-3xl">{meta.icon}</span>
                        <span className="line-clamp-4 text-xs font-medium text-stone-500">
                          {b.title}
                        </span>
                      </div>
                    )}
                    <span className="absolute left-1.5 top-1.5 rounded-full bg-white/90 px-1.5 py-0.5 text-[10px] font-medium text-stone-600 shadow-sm">
                      {meta.icon} {meta.label}
                    </span>
                    {typeof pct === "number" && pct > 0 && (
                      <div className="absolute inset-x-0 bottom-0 h-1 bg-stone-200">
                        <div
                          className="h-full bg-teal-500"
                          style={{ width: `${Math.min(100, pct)}%` }}
                        />
                      </div>
                    )}
                  </div>
                  <div className="p-2.5">
                    <div className="line-clamp-2 text-sm font-medium leading-snug">
                      {b.title}
                    </div>
                    {b.author && (
                      <div className="mt-0.5 truncate text-xs text-stone-500">{b.author}</div>
                    )}
                    {typeof pct === "number" && pct > 0 && (
                      <div className="mt-1 text-[11px] text-teal-600">
                        {Math.round(pct)}% {b.file_type === "audio" ? "listened" : "read"}
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Google Play Books ─────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-stone-500">
          Google Play Books
          {googleShelf.length > 0 && ` · ${googleShelf.length} titles`}
        </h2>

        {!configured ? (
          <div className="rounded-xl border border-stone-200 bg-white p-6">
            <p className="text-sm font-medium text-stone-600">
              🔌 Google connection — not set up yet
            </p>
            <p className="mt-2 max-w-2xl text-sm text-stone-400">
              Once the app is registered with Google (a one-time, free setup — see{" "}
              <code className="rounded bg-stone-100 px-1">docs/google-books-setup.md</code>),
              every family member can connect their own Google account here and their Play
              Books — including Family Library shares — appear on this shelf. Books stay in
              Google&apos;s ecosystem; Nestly just shows what everyone owns.
            </p>
          </div>
        ) : (
          <>
            <GoogleShelfControls
              connected={Boolean(myAccount)}
              email={myAccount?.google_email ?? null}
              lastSynced={myAccount?.last_synced_at ?? null}
              othersConnected={connections.filter((c) => c.user_id !== userId).length}
            />

            {googleShelf.length > 0 && (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {googleShelf.map((g) => (
                  <a
                    key={g.volume_id}
                    href={g.info_link ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="group overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm transition-shadow hover:shadow-md"
                  >
                    <div className="relative aspect-[2/3] bg-stone-100">
                      {g.thumbnail_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={g.thumbnail_url}
                          alt=""
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-3 text-center">
                          <span className="text-3xl">📕</span>
                          <span className="line-clamp-4 text-xs font-medium text-stone-500">
                            {g.title}
                          </span>
                        </div>
                      )}
                      <span className="absolute left-1.5 top-1.5 rounded-full bg-white/90 px-1.5 py-0.5 text-[10px] font-medium text-stone-600 shadow-sm">
                        ▶ Play Books
                      </span>
                    </div>
                    <div className="p-2.5">
                      <div className="line-clamp-2 text-sm font-medium leading-snug">
                        {g.title}
                      </div>
                      {g.authors && (
                        <div className="mt-0.5 truncate text-xs text-stone-500">{g.authors}</div>
                      )}
                      <div className="mt-1 truncate text-[11px] text-stone-400">
                        {g.owners.join(", ")}&apos;s shelf
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      <p className="text-xs text-stone-400">
        Uploaded books are only visible to this family. Google titles open in Play Books —
        the files (and any DRM) stay with Google.
      </p>
    </div>
  );
}
