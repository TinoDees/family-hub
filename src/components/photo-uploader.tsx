"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** Downscale an image in the browser to max 1600px, WebP ~80%. */
async function resizeImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Could not process image"))),
      "image/webp",
      0.8
    )
  );
}

export function PhotoUploader({
  householdId,
  albumId,
  showVisibility = false,
}: {
  householdId: string;
  albumId: string;
  /** trip albums: let the uploader pick family-only vs everyone on the trip */
  showVisibility?: boolean;
}) {
  const [visibility, setVisibility] = useState<"trip" | "household">("trip");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);

  const upload = async (files: FileList) => {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    let done = 0;
    try {
      for (const file of Array.from(files)) {
        setProgress(`Uploading ${done + 1} of ${files.length}…`);
        let blob: Blob;
        try {
          blob = await resizeImage(file);
        } catch {
          blob = file; // HEIC etc. the canvas can't decode — upload original
        }
        const path = `${householdId}/${albumId}/${crypto.randomUUID()}.webp`;
        const { error: upErr } = await supabase.storage
          .from("photos")
          .upload(path, blob, { contentType: blob.type || "image/webp" });
        if (upErr) throw new Error(upErr.message);
        const { error: rowErr } = await supabase.from("photos").insert({
          household_id: householdId,
          album_id: albumId,
          storage_path: path,
          visibility: showVisibility ? visibility : "trip",
        });
        if (rowErr) throw new Error(rowErr.message);
        done++;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      setProgress("");
      if (inputRef.current) inputRef.current.value = "";
      if (done > 0) router.refresh();
    }
  };

  return (
    <div className="rounded-xl border border-dashed border-stone-300 bg-white p-5 text-center">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        disabled={busy}
        onChange={(e) => e.target.files?.length && upload(e.target.files)}
        className="hidden"
        id="photo-input"
      />
      <label
        htmlFor="photo-input"
        className={`inline-block cursor-pointer rounded-lg px-5 py-2 text-sm font-medium text-white ${busy ? "bg-stone-400" : "bg-stone-900 hover:bg-stone-700"}`}
      >
        {busy ? progress || "Uploading…" : "📷 Add photos"}
      </label>
      {showVisibility && (
        <div className="mt-3 flex items-center justify-center gap-4 text-xs">
          <label className="flex items-center gap-1.5">
            <input type="radio" name="photo-visibility" checked={visibility === "trip"} onChange={() => setVisibility("trip")} />
            Everyone on the trip
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" name="photo-visibility" checked={visibility === "household"} onChange={() => setVisibility("household")} />
            Family only
          </label>
        </div>
      )}
      <p className="mt-2 text-xs text-stone-400">
        Photos are resized on your device before upload — fast even on holiday Wi-Fi.
      </p>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
