"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { bulkDeletePhotos, updatePhotoCaptions } from "@/lib/actions/photos-bulk";

export type GalleryPhoto = { id: string; url: string | null; caption: string | null; isReceipt: boolean };

function Grid({
  photos,
  selecting,
  selected,
  toggle,
  small,
}: {
  photos: GalleryPhoto[];
  selecting: boolean;
  selected: Set<string>;
  toggle: (id: string) => void;
  small?: boolean;
}) {
  return (
    <div className={small ? "grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6" : "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4"}>
      {photos.map((p) => (
        <div
          key={p.id}
          onClick={() => selecting && toggle(p.id)}
          className={`relative overflow-hidden rounded-xl border bg-stone-100 ${
            selecting ? "cursor-pointer" : ""
          } ${selected.has(p.id) ? "border-sky-500 ring-2 ring-sky-300" : "border-stone-200"}`}
        >
          {p.url ? (
            selecting ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.url} alt={p.caption ?? ""} className="aspect-square w-full object-cover" loading="lazy" />
            ) : (
              <a href={p.url} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={p.caption ?? ""} className="aspect-square w-full object-cover" loading="lazy" />
              </a>
            )
          ) : (
            <div className="flex aspect-square items-center justify-center text-stone-300">📷</div>
          )}
          {selecting && (
            <span
              className={`absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full border text-[11px] font-bold ${
                selected.has(p.id) ? "border-sky-500 bg-sky-500 text-white" : "border-white bg-black/30 text-transparent"
              }`}
            >
              ✓
            </span>
          )}
          {p.caption && !p.isReceipt && (
            <div className="absolute inset-x-0 bottom-0 bg-black/50 px-2 py-1 text-xs text-white">{p.caption}</div>
          )}
        </div>
      ))}
    </div>
  );
}

export function PhotoGallery({
  photos,
  canEdit,
}: {
  photos: GalleryPhoto[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [captionMode, setCaptionMode] = useState(false);
  const [caption, setCaption] = useState("");
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const normal = photos.filter((p) => !p.isReceipt);
  const receipts = photos.filter((p) => p.isReceipt);

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const exitSelect = () => {
    setSelecting(false);
    setSelected(new Set());
    setCaptionMode(false);
    setCaption("");
  };

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          {!selecting ? (
            <button
              type="button"
              onClick={() => setSelecting(true)}
              className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-medium hover:bg-stone-100"
            >
              ☑ Select
            </button>
          ) : (
            <>
              <span className="text-sm text-stone-500">{selected.size} selected</span>
              <button
                type="button"
                onClick={() => setSelected(new Set(photos.map((p) => p.id)))}
                className="rounded-lg border border-stone-300 px-2.5 py-1 text-xs font-medium hover:bg-stone-100"
              >
                All
              </button>
              <button
                type="button"
                disabled={selected.size === 0 || pending}
                onClick={() => {
                  if (!window.confirm(`Delete ${selected.size} photo${selected.size === 1 ? "" : "s"}? This cannot be undone.`)) return;
                  startTransition(async () => {
                    const res = await bulkDeletePhotos([...selected]);
                    setMsg(res.ok ? `Deleted ${res.deleted}.` : (res.error ?? "Delete failed"));
                    exitSelect();
                    router.refresh();
                  });
                }}
                className="rounded-lg border border-red-300 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-40"
              >
                {pending ? "Deleting…" : "🗑 Delete"}
              </button>
              <button
                type="button"
                disabled={selected.size === 0}
                onClick={() => setCaptionMode((v) => !v)}
                className="rounded-lg border border-stone-300 px-3 py-1 text-xs font-medium hover:bg-stone-100 disabled:opacity-40"
              >
                ✎ Caption
              </button>
              <button type="button" onClick={exitSelect} className="rounded-lg px-2 py-1 text-xs text-stone-400 hover:bg-stone-100">
                Cancel
              </button>
            </>
          )}
          {msg && <span className="text-xs text-stone-500">{msg}</span>}
        </div>
      )}

      {selecting && captionMode && (
        <div className="flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 p-2">
          <input
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Caption / story for the selected photos…"
            autoFocus
            className="flex-1 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm"
          />
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const res = await updatePhotoCaptions([...selected], caption);
                setMsg(res.ok ? "Caption saved." : (res.error ?? "Failed"));
                exitSelect();
                router.refresh();
              })
            }
            className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-medium text-white"
          >
            Save
          </button>
        </div>
      )}

      <div className="rounded-xl border border-stone-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold">📷 Photos</h2>
        {normal.length === 0 ? (
          <p className="py-6 text-center text-sm text-stone-400">No photos yet.</p>
        ) : (
          <Grid photos={normal} selecting={selecting} selected={selected} toggle={toggle} />
        )}
      </div>

      {receipts.length > 0 && (
        <details className="rounded-xl border border-stone-200 bg-white" open={selecting}>
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">
            🧾 Receipts ({receipts.length})
          </summary>
          <div className="border-t border-stone-100 p-4">
            <Grid photos={receipts} selecting={selecting} selected={selected} toggle={toggle} small />
          </div>
        </details>
      )}
    </div>
  );
}
