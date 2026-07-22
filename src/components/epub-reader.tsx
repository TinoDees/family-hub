"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Book, Rendition } from "epubjs";
import { saveLibraryProgress } from "@/lib/actions/library";

type TocEntry = { href: string; label: string };

/**
 * In-app EPUB reader (epub.js). The book file arrives via a signed URL from
 * the private bucket; epubjs renders it into an iframe. Your position (CFI)
 * is saved a moment after each page turn, so you resume anywhere.
 */
export function EpubReader({
  bookId,
  title,
  url,
  initialLocation,
}: {
  bookId: string;
  title: string;
  url: string;
  initialLocation: string | null;
}) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<Book | null>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCfi = useRef<{ cfi: string; pct: number | null } | null>(null);

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [percent, setPercent] = useState<number | null>(null);
  const [toc, setToc] = useState<TocEntry[]>([]);
  const [fontSize, setFontSize] = useState(100);

  useEffect(() => {
    let cancelled = false;
    let cleanupKeys: (() => void) | undefined;

    (async () => {
      try {
        const ePub = (await import("epubjs")).default;
        if (cancelled || !viewerRef.current) return;

        const book = ePub(url);
        bookRef.current = book;
        const rendition = book.renderTo(viewerRef.current, {
          width: "100%",
          height: "100%",
          spread: "auto",
        });
        renditionRef.current = rendition;

        await rendition.display(initialLocation || undefined);
        if (cancelled) return;
        setReady(true);

        book.loaded.navigation.then((nav) => {
          if (cancelled) return;
          const flat: TocEntry[] = [];
          const walk = (items: { href: string; label: string; subitems?: unknown }[]) => {
            for (const item of items) {
              flat.push({ href: item.href, label: item.label.trim() });
              const subs = item.subitems as typeof items | undefined;
              if (subs?.length) walk(subs);
            }
          };
          walk(nav.toc);
          setToc(flat.slice(0, 200));
        });

        // Percent needs the location index — generate in the background.
        book.ready.then(() => book.locations.generate(900)).catch(() => {});

        rendition.on("relocated", (loc: { start?: { cfi?: string } }) => {
          const cfi = loc?.start?.cfi;
          if (!cfi) return;
          let pct: number | null = null;
          try {
            if (book.locations.length()) {
              const p = book.locations.percentageFromCfi(cfi);
              if (typeof p === "number" && isFinite(p)) pct = p * 100;
            }
          } catch {
            // locations not ready yet — save without percent
          }
          setPercent(pct);
          lastCfi.current = { cfi, pct };
          if (saveTimer.current) clearTimeout(saveTimer.current);
          saveTimer.current = setTimeout(() => {
            void saveLibraryProgress(bookId, cfi, pct);
          }, 1500);
        });

        const onKey = (e: KeyboardEvent) => {
          if (e.key === "ArrowLeft") rendition.prev();
          if (e.key === "ArrowRight") rendition.next();
        };
        document.addEventListener("keydown", onKey);
        rendition.on("keydown", onKey); // when focus is inside the book iframe
        cleanupKeys = () => document.removeEventListener("keydown", onKey);
      } catch {
        if (!cancelled)
          setError("This EPUB couldn't be opened — the file may be damaged or DRM-locked.");
      }
    })();

    return () => {
      cancelled = true;
      cleanupKeys?.();
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        // flush the last position so a quick exit still saves
        if (lastCfi.current) {
          void saveLibraryProgress(bookId, lastCfi.current.cfi, lastCfi.current.pct);
        }
      }
      try {
        bookRef.current?.destroy();
      } catch {
        // already gone
      }
    };
  }, [bookId, url, initialLocation]);

  useEffect(() => {
    renditionRef.current?.themes.fontSize(`${fontSize}%`);
  }, [fontSize, ready]);

  return (
    <div className="flex h-[calc(100dvh-140px)] min-h-[420px] flex-col">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-t-xl border border-stone-200 bg-white px-3 py-2">
        <Link
          href={`/library/${bookId}`}
          className="rounded-lg border border-stone-300 px-2.5 py-1 text-sm font-medium text-stone-600 hover:bg-stone-50"
        >
          ← Done
        </Link>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-stone-700">
          {title}
        </span>
        {toc.length > 0 && (
          <select
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) renditionRef.current?.display(e.target.value);
              e.target.value = "";
            }}
            className="max-w-40 rounded-lg border border-stone-300 px-2 py-1 text-sm text-stone-600"
          >
            <option value="" disabled>
              Contents…
            </option>
            {toc.map((t, i) => (
              <option key={`${t.href}-${i}`} value={t.href}>
                {t.label || "—"}
              </option>
            ))}
          </select>
        )}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setFontSize((s) => Math.max(70, s - 10))}
            className="rounded-lg border border-stone-300 px-2 py-1 text-xs font-medium text-stone-600 hover:bg-stone-50"
            title="Smaller text"
          >
            A−
          </button>
          <button
            onClick={() => setFontSize((s) => Math.min(180, s + 10))}
            className="rounded-lg border border-stone-300 px-2 py-1 text-sm font-medium text-stone-600 hover:bg-stone-50"
            title="Bigger text"
          >
            A+
          </button>
        </div>
        {percent !== null && (
          <span className="text-xs tabular-nums text-stone-400">{Math.round(percent)}%</span>
        )}
      </div>

      {/* book */}
      <div className="relative flex-1 overflow-hidden rounded-b-xl border-x border-b border-stone-200 bg-white">
        {!ready && !error && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-stone-400">
            Opening the book…
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-red-600">
            {error}
          </div>
        )}
        <div ref={viewerRef} className="h-full w-full" />

        {ready && (
          <>
            <button
              onClick={() => renditionRef.current?.prev()}
              aria-label="Previous page"
              className="absolute inset-y-0 left-0 w-12 text-2xl text-stone-300 transition-colors hover:bg-stone-50/60 hover:text-stone-500"
            >
              ‹
            </button>
            <button
              onClick={() => renditionRef.current?.next()}
              aria-label="Next page"
              className="absolute inset-y-0 right-0 w-12 text-2xl text-stone-300 transition-colors hover:bg-stone-50/60 hover:text-stone-500"
            >
              ›
            </button>
          </>
        )}
      </div>
      <p className="mt-1.5 text-center text-[11px] text-stone-400">
        Arrow keys or the side arrows turn pages · your place saves automatically
      </p>
    </div>
  );
}
