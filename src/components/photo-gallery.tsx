"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { bulkDeletePhotos, updatePhotoCaptions, setAlbumHero, updatePhotoSection } from "@/lib/actions/photos-bulk";

export type GalleryPhoto = {
  id: string;
  url: string | null;
  caption: string | null;
  isReceipt: boolean;
  section?: string | null;
  section_date?: string | null;
};

export function PhotoGallery({
  photos,
  canEdit,
  heroPhotoId,
}: {
  photos: GalleryPhoto[];
  canEdit: boolean;
  heroPhotoId?: string | null;
}) {
  const router = useRouter();
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [inputMode, setInputMode] = useState<"caption" | "section" | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [sectionDate, setSectionDate] = useState("");
  const [sortBy, setSortBy] = useState<"date" | "name">("date");
  // Section-header editing (rename / re-date a whole section without selecting photos)
  const [editSection, setEditSection] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDate, setEditDate] = useState("");

  const normal = photos.filter((p) => !p.isReceipt);
  const receipts = photos.filter((p) => p.isReceipt);
  const viewable = normal.filter((p) => p.url); // lightbox order

  // group by section (null last as "Photos")
  const sections = new Map<string, GalleryPhoto[]>();
  for (const p of normal) {
    const key = p.section?.trim() || "";
    sections.set(key, [...(sections.get(key) ?? []), p]);
  }
  const dateOf = (photos: GalleryPhoto[]) =>
    photos.map((p) => p.section_date).find(Boolean) ?? null;
  const orderedSections = [...sections.entries()].sort(([a, pa], [b, pb]) => {
    if (a === "") return 1;
    if (b === "") return -1;
    if (sortBy === "date") {
      const da = dateOf(pa);
      const db = dateOf(pb);
      if (da && db && da !== db) return da.localeCompare(db);
      if (da && !db) return -1;
      if (!da && db) return 1;
    }
    return a.localeCompare(b);
  });
  const hasNamedSections = orderedSections.some(([n]) => n !== "");

  // lightbox keyboard nav
  useEffect(() => {
    if (lightbox === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(null);
      if (e.key === "ArrowRight") setLightbox((i) => (i === null ? null : (i + 1) % viewable.length));
      if (e.key === "ArrowLeft") setLightbox((i) => (i === null ? null : (i - 1 + viewable.length) % viewable.length));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, viewable.length]);

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
    setInputMode(null);
    setInputValue("");
  };

  const Tile = ({ p }: { p: GalleryPhoto }) => (
    <div
      onClick={() => {
        if (selecting) toggle(p.id);
        else if (p.url && !p.isReceipt) setLightbox(viewable.findIndex((v) => v.id === p.id));
        else if (p.url) window.open(p.url, "_blank");
      }}
      className={`relative cursor-pointer overflow-hidden rounded-xl border bg-stone-100 ${
        selected.has(p.id)
          ? "border-sky-500 ring-2 ring-sky-300"
          : p.id === heroPhotoId
            ? "border-amber-400 ring-2 ring-amber-200"
            : "border-stone-200"
      }`}
    >
      <div className="absolute inset-0 flex items-center justify-center text-2xl text-stone-300">📷</div>
      {p.url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={p.url}
          alt={p.caption ?? ""}
          className="relative aspect-square w-full object-cover"
          loading="lazy"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
          }}
        />
      )}
      {!p.url && <div className="aspect-square w-full" />}
      {p.id === heroPhotoId && !selecting && (
        <span className="absolute left-1.5 top-1.5 rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-semibold text-white">
          ★ hero
        </span>
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
  );

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
                {pending ? "Working…" : "🗑 Delete"}
              </button>
              <button
                type="button"
                disabled={
                  selected.size !== 1 ||
                  photos.find((p) => selected.has(p.id))?.isReceipt === true
                }
                onClick={() => {
                  const id = [...selected][0];
                  startTransition(async () => {
                    const res = await setAlbumHero(id);
                    setMsg(res.ok ? "Hero picture set ★" : (res.error ?? "Failed"));
                    exitSelect();
                    router.refresh();
                  });
                }}
                className="rounded-lg border border-amber-300 px-3 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-40"
              >
                ★ Hero
              </button>
              <button
                type="button"
                disabled={selected.size === 0}
                onClick={() => setInputMode(inputMode === "caption" ? null : "caption")}
                className="rounded-lg border border-stone-300 px-3 py-1 text-xs font-medium hover:bg-stone-100 disabled:opacity-40"
              >
                ✎ Caption
              </button>
              <button
                type="button"
                disabled={selected.size === 0}
                onClick={() => {
                  if (inputMode === "section") {
                    setInputMode(null);
                    return;
                  }
                  // Prefill from the first selected photo so editing doesn't wipe the name
                  const first = photos.find((p) => selected.has(p.id));
                  setInputValue(first?.section ?? "");
                  setSectionDate(first?.section_date ?? "");
                  setInputMode("section");
                }}
                className="rounded-lg border border-stone-300 px-3 py-1 text-xs font-medium hover:bg-stone-100 disabled:opacity-40"
              >
                📂 Section
              </button>
              <button type="button" onClick={exitSelect} className="rounded-lg px-2 py-1 text-xs text-stone-400 hover:bg-stone-100">
                Cancel
              </button>
            </>
          )}
          {msg && <span className="text-xs text-stone-500">{msg}</span>}
          {hasNamedSections && (
            <span className="ml-auto flex overflow-hidden rounded-lg border border-stone-300 text-xs">
              {(["date", "name"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setSortBy(k)}
                  className={`px-2.5 py-1 ${sortBy === k ? "bg-stone-900 text-white" : "hover:bg-stone-100"}`}
                >
                  {k === "date" ? "📅 Date" : "A–Z"}
                </button>
              ))}
            </span>
          )}
        </div>
      )}

      {selecting && inputMode && (
        <div className="flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 p-2">
          <input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={
              inputMode === "caption"
                ? "Caption / story for the selected photos…"
                : 'Section name, e.g. "Trip to Phuket Markets" (clear name + date = remove from section)'
            }
            autoFocus
            className="min-w-0 flex-1 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm"
          />
          {inputMode === "section" && (
            <input
              type="date"
              value={sectionDate}
              onChange={(e) => setSectionDate(e.target.value)}
              title="Section date (for sorting)"
              className="rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm"
            />
          )}
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const res =
                  inputMode === "caption"
                    ? await updatePhotoCaptions([...selected], inputValue)
                    : await updatePhotoSection([...selected], inputValue, sectionDate || null);
                setMsg(res.ok ? (inputMode === "caption" ? "Caption saved." : "Section saved.") : (res.error ?? "Failed"));
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

      {orderedSections.length === 0 && (
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <p className="py-6 text-center text-sm text-stone-400">No photos yet.</p>
        </div>
      )}
      {orderedSections.map(([name, sectionPhotos]) => (
        <details key={name || "__default"} open className="rounded-xl border border-stone-200 bg-white">
          <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-semibold">
            <span>{name || "📷 Photos"}</span>
            {name !== "" && dateOf(sectionPhotos) && (
              <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-normal text-stone-500">
                {new Date(`${dateOf(sectionPhotos)}T00:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
              </span>
            )}
            {canEdit && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (editSection === name) {
                    setEditSection(null);
                    return;
                  }
                  setEditSection(name);
                  setEditName(name);
                  setEditDate(dateOf(sectionPhotos) ?? "");
                }}
                title={name ? "Rename section / change date" : "Group these photos into a section"}
                className="rounded px-1.5 py-0.5 text-xs font-normal text-stone-400 hover:bg-stone-100 hover:text-stone-700"
              >
                ✎
              </button>
            )}
            <span className="ml-auto text-xs font-normal text-stone-400">{sectionPhotos.length}</span>
          </summary>
          {editSection === name && (
            <div className="flex flex-wrap items-center gap-2 border-t border-stone-100 bg-sky-50 p-3">
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder='Section name, e.g. "Teppanyaki Dinner"'
                autoFocus
                className="min-w-0 flex-1 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm"
              />
              <input
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                title="Section date (for sorting)"
                className="h-9 rounded-lg border border-stone-300 bg-white px-2 text-sm"
              />
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const res = await updatePhotoSection(
                      sectionPhotos.map((p) => p.id),
                      editName,
                      editDate || null
                    );
                    setMsg(res.ok ? "Section updated." : (res.error ?? "Failed"));
                    setEditSection(null);
                    router.refresh();
                  })
                }
                className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
              >
                {pending ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={() => setEditSection(null)}
                className="rounded-lg px-2 py-1 text-xs text-stone-400 hover:bg-stone-100"
              >
                Cancel
              </button>
              {name !== "" && (
                <p className="w-full text-[11px] text-stone-500">
                  Renames the section for all {sectionPhotos.length} photos in it. Clear both fields to ungroup.
                </p>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 border-t border-stone-100 p-4 sm:grid-cols-3 md:grid-cols-4">
            {sectionPhotos.map((p) => (
              <Tile key={p.id} p={p} />
            ))}
          </div>
        </details>
      ))}

      {receipts.length > 0 && (
        <details className="rounded-xl border border-stone-200 bg-white" open={selecting}>
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">
            🧾 Receipts ({receipts.length})
          </summary>
          <div className="grid grid-cols-3 gap-2 border-t border-stone-100 p-4 sm:grid-cols-4 md:grid-cols-6">
            {receipts.map((p) => (
              <Tile key={p.id} p={p} />
            ))}
          </div>
        </details>
      )}

      {lightbox !== null && viewable[lightbox] && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90" onClick={() => setLightbox(null)}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setLightbox((lightbox - 1 + viewable.length) % viewable.length);
            }}
            className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 px-4 py-3 text-2xl text-white hover:bg-white/20"
            aria-label="Previous"
          >
            ‹
          </button>
          <div className="max-h-[92vh] max-w-[94vw]" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={viewable[lightbox].url!}
              alt={viewable[lightbox].caption ?? ""}
              className="max-h-[86vh] max-w-[94vw] rounded-lg object-contain"
            />
            <div className="mt-2 flex items-center justify-between text-sm text-white/80">
              <span>{viewable[lightbox].caption ?? ""}</span>
              <span>
                {lightbox + 1} / {viewable.length}
              </span>
            </div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setLightbox((lightbox + 1) % viewable.length);
            }}
            className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 px-4 py-3 text-2xl text-white hover:bg-white/20"
            aria-label="Next"
          >
            ›
          </button>
          <button
            onClick={() => setLightbox(null)}
            className="absolute right-3 top-3 rounded-full bg-white/10 px-3 py-1.5 text-white hover:bg-white/20"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
