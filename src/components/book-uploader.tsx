"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { createLibraryBook } from "@/lib/actions/library";

type Kind = "epub" | "pdf" | "audio";

const KIND_META: Record<Kind, { icon: string; label: string }> = {
  epub: { icon: "📖", label: "E-book (EPUB)" },
  pdf: { icon: "📄", label: "PDF" },
  audio: { icon: "🎧", label: "Audiobook" },
};

function kindOf(name: string): { kind: Kind; ext: string; mime: string } | null {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (ext === "epub") return { kind: "epub", ext, mime: "application/epub+zip" };
  if (ext === "pdf") return { kind: "pdf", ext, mime: "application/pdf" };
  if (ext === "mp3") return { kind: "audio", ext, mime: "audio/mpeg" };
  if (ext === "m4a" || ext === "m4b") return { kind: "audio", ext, mime: "audio/mp4" };
  return null;
}

const fmtSize = (bytes: number) =>
  bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;

/** Shrink a cover image to max 640px WebP (same idea as photo uploads). */
async function shrinkCover(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, 640 / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("cover"))), "image/webp", 0.85)
  );
}

/**
 * Read title / author / cover straight out of the EPUB (it's a zip with an
 * OPF manifest inside). Everything happens in the browser — nothing uploads
 * until the member hits Add. Best-effort: a weird EPUB just means the fields
 * start blank.
 */
async function epubMeta(
  file: File
): Promise<{ title?: string; author?: string; cover?: Blob }> {
  try {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(file);

    const containerXml = await zip.file("META-INF/container.xml")?.async("string");
    if (!containerXml) return {};
    const container = new DOMParser().parseFromString(containerXml, "application/xml");
    const opfPath = container.getElementsByTagName("rootfile")[0]?.getAttribute("full-path");
    if (!opfPath) return {};

    const opfXml = await zip.file(opfPath)?.async("string");
    if (!opfXml) return {};
    const opf = new DOMParser().parseFromString(opfXml, "application/xml");
    const DC = "http://purl.org/dc/elements/1.1/";

    const title = opf.getElementsByTagNameNS(DC, "title")[0]?.textContent?.trim() || undefined;
    const author =
      Array.from(opf.getElementsByTagNameNS(DC, "creator"))
        .map((el) => el.textContent?.trim())
        .filter(Boolean)
        .join(", ") || undefined;

    // Cover: EPUB3 manifest item with properties="cover-image", or the
    // EPUB2 <meta name="cover" content="item-id"> convention.
    const items = Array.from(opf.getElementsByTagName("item"));
    const coverId = Array.from(opf.getElementsByTagName("meta"))
      .find((m) => m.getAttribute("name") === "cover")
      ?.getAttribute("content");
    const coverItem =
      items.find((i) => (i.getAttribute("properties") ?? "").includes("cover-image")) ??
      (coverId ? items.find((i) => i.getAttribute("id") === coverId) : undefined);

    let cover: Blob | undefined;
    const href = coverItem?.getAttribute("href");
    if (href) {
      const base = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1) : "";
      const stack: string[] = [];
      for (const p of (base + decodeURIComponent(href)).split("/")) {
        if (p === "..") stack.pop();
        else if (p && p !== ".") stack.push(p);
      }
      const raw = await zip.file(stack.join("/"))?.async("blob");
      if (raw) {
        try {
          cover = await shrinkCover(raw);
        } catch {
          // undisplayable cover format — skip it
        }
      }
    }
    return { title, author, cover };
  } catch {
    return {};
  }
}

export function BookUploader({ householdId }: { householdId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<{ kind: Kind; ext: string; mime: string } | null>(null);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [cover, setCover] = useState<Blob | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [owned, setOwned] = useState(false);
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    if (!cover) {
      setCoverUrl(null);
      return;
    }
    const url = URL.createObjectURL(cover);
    setCoverUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [cover]);

  const pick = async (f: File) => {
    const k = kindOf(f.name);
    if (!k) {
      setError("That file type isn't supported — use .epub, .pdf, .mp3, .m4a or .m4b.");
      return;
    }
    setError(null);
    setFile(f);
    setKind(k);
    setCover(null);
    setTitle(f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim());
    setAuthor("");
    if (k.kind === "epub") {
      setReading(true);
      const meta = await epubMeta(f);
      if (meta.title) setTitle(meta.title);
      if (meta.author) setAuthor(meta.author);
      if (meta.cover) setCover(meta.cover);
      setReading(false);
    }
  };

  const submit = async () => {
    if (!file || !kind) return;
    if (!title.trim()) {
      setError("Give the book a title first.");
      return;
    }
    if (!owned) {
      setError("Please tick the ownership confirmation first.");
      return;
    }
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const uid = crypto.randomUUID();
    const bookPath = `${householdId}/books/${uid}.${kind.ext}`;
    const coverPath = cover ? `${householdId}/covers/${uid}.webp` : null;
    try {
      setProgress(`Uploading ${fmtSize(file.size)}…`);
      const { error: upErr } = await supabase.storage
        .from("library")
        .upload(bookPath, file, { contentType: kind.mime });
      if (upErr) throw new Error(upErr.message);

      if (cover && coverPath) {
        setProgress("Uploading cover…");
        await supabase.storage
          .from("library")
          .upload(coverPath, cover, { contentType: "image/webp" });
      }

      setProgress("Saving…");
      const fd = new FormData();
      fd.set("title", title.trim());
      fd.set("author", author.trim());
      fd.set("file_type", kind.kind);
      fd.set("storage_path", bookPath);
      if (cover && coverPath) fd.set("cover_path", coverPath);
      fd.set("mime", kind.mime);
      fd.set("file_bytes", String(file.size));
      fd.set("ownership_confirmed", "on");
      const res = await createLibraryBook(fd);
      if (!res.ok) throw new Error(res.error ?? "Could not save");

      router.push("/library");
      router.refresh();
    } catch (e) {
      // best-effort cleanup so a failed save doesn't strand files
      await supabase.storage
        .from("library")
        .remove([bookPath, ...(coverPath ? [coverPath] : [])]);
      setError(e instanceof Error ? e.message : "Upload failed — try again.");
      setBusy(false);
      setProgress("");
    }
  };

  return (
    <div className="space-y-5">
      {/* file picker / drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f && !busy) pick(f);
        }}
        className={`rounded-xl border border-dashed bg-white p-6 text-center ${
          dragOver ? "border-teal-400 bg-teal-50" : "border-stone-300"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".epub,.pdf,.mp3,.m4a,.m4b"
          disabled={busy}
          onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])}
          className="hidden"
          id="book-input"
        />
        <label
          htmlFor="book-input"
          className={`inline-block cursor-pointer rounded-lg px-5 py-2 text-sm font-medium text-white ${
            busy ? "bg-stone-400" : "bg-stone-900 hover:bg-stone-700"
          }`}
        >
          {file ? "Choose a different file" : "📚 Choose a book file"}
        </label>
        <p className="mt-2 text-xs text-stone-400">
          EPUB e-books, PDFs, or MP3 / M4A / M4B audiobooks — up to 200 MB. Drag &amp; drop
          works too.
        </p>
        {file && kind && (
          <p className="mt-2 text-sm text-stone-600">
            {KIND_META[kind.kind].icon} {file.name}{" "}
            <span className="text-stone-400">
              · {KIND_META[kind.kind].label} · {fmtSize(file.size)}
            </span>
            {reading && <span className="text-stone-400"> · reading details…</span>}
          </p>
        )}
      </div>

      {file && kind && (
        <div className="rounded-xl border border-stone-200 bg-white p-5">
          <div className="flex gap-5">
            <div className="w-24 shrink-0">
              <div className="aspect-[2/3] overflow-hidden rounded-lg border border-stone-200 bg-stone-100">
                {coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={coverUrl} alt="Cover" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-2xl">
                    {KIND_META[kind.kind].icon}
                  </div>
                )}
              </div>
              {kind.kind === "epub" && (
                <p className="mt-1 text-center text-[10px] text-stone-400">
                  {coverUrl ? "Cover from the EPUB" : "No cover found"}
                </p>
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-500">Title</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={busy}
                  className="w-full rounded-lg border border-stone-300 px-3 py-1.5 text-sm"
                  placeholder="Book title"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-500">
                  Author <span className="font-normal text-stone-400">(optional)</span>
                </label>
                <input
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  disabled={busy}
                  className="w-full rounded-lg border border-stone-300 px-3 py-1.5 text-sm"
                  placeholder="Author"
                />
              </div>
            </div>
          </div>

          <label className="mt-4 flex items-start gap-2.5 rounded-lg bg-stone-50 p-3 text-sm text-stone-600">
            <input
              type="checkbox"
              checked={owned}
              onChange={(e) => setOwned(e.target.checked)}
              disabled={busy}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium">I own this book</span> — it&apos;s a DRM-free
              copy I legitimately purchased or that is freely distributable, and I&apos;m
              sharing it only with my own family.
            </span>
          </label>

          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={submit}
              disabled={busy || reading}
              className={`rounded-lg px-5 py-2 text-sm font-medium text-white ${
                busy ? "bg-stone-400" : "bg-stone-900 hover:bg-stone-700"
              }`}
            >
              {busy ? progress || "Uploading…" : "Add to the family shelf"}
            </button>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <p className="font-medium">A quick word on DRM 🔒</p>
        <p className="mt-1">
          Most store-bought e-books (including Google Play purchases) are DRM-locked and
          can&apos;t be uploaded — the file only opens inside the store&apos;s own app. If a
          book downloads as a plain .epub or .pdf that opens anywhere, it&apos;s DRM-free
          and fine to add. For locked books, connect Google on the Library page instead —
          they&apos;ll show on the family shelf and open in Play Books.
        </p>
      </div>
    </div>
  );
}
