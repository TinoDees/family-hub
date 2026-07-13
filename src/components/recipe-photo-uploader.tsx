"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { claimHeroIfEmpty } from "@/lib/actions/recipe-photos";

async function resizeImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("resize failed"))), "image/webp", 0.8)
  );
}

export function RecipePhotoUploader({
  householdId,
  recipeId,
}: {
  householdId: string;
  recipeId: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (files: FileList) => {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    let done = 0;
    try {
      for (const file of Array.from(files)) {
        let blob: Blob;
        try {
          blob = await resizeImage(file);
        } catch {
          blob = file;
        }
        const path = `${householdId}/${recipeId}/${crypto.randomUUID()}.webp`;
        const { error: upErr } = await supabase.storage
          .from("recipe-photos")
          .upload(path, blob, { contentType: blob.type || "image/webp" });
        if (upErr) throw new Error(upErr.message);
        const { data: row, error: rowErr } = await supabase
          .from("recipe_photos")
          .insert({ household_id: householdId, recipe_id: recipeId, storage_path: path })
          .select("id")
          .single();
        if (rowErr || !row) throw new Error(rowErr?.message ?? "insert failed");
        await claimHeroIfEmpty(recipeId, row.id);
        done++;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
      if (done > 0) router.refresh();
    }
  };

  const [dragOver, setDragOver] = useState(false);

  const fromItems = (items: DataTransferItemList | null) => {
    if (!items) return;
    const files: File[] = [];
    for (const item of Array.from(items)) {
      const f = item.getAsFile?.();
      if (f && f.type.startsWith("image/")) files.push(f);
    }
    if (files.length) {
      const dt = new DataTransfer();
      files.forEach((f) => dt.items.add(f));
      upload(dt.files);
    }
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (!busy) fromItems(e.dataTransfer.items);
      }}
      onPaste={(e) => {
        if (!busy) fromItems(e.clipboardData?.items ?? null);
      }}
      tabIndex={0}
      className={`rounded-lg outline-none ${dragOver ? "ring-2 ring-sky-300" : ""}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        disabled={busy}
        onChange={(e) => e.target.files?.length && upload(e.target.files)}
        className="hidden"
        id="recipe-photo-input"
      />
      <input
        type="file"
        accept="image/*"
        capture="environment"
        disabled={busy}
        onChange={(e) => e.target.files?.length && upload(e.target.files)}
        className="hidden"
        id="recipe-photo-camera"
      />
      <div className="flex flex-wrap items-center gap-2">
        <label
          htmlFor="recipe-photo-input"
          className={`inline-block cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-medium ${busy ? "border-stone-200 text-stone-400" : "border-stone-300 hover:bg-stone-100"}`}
        >
          {busy ? "Uploading…" : "🖼 Add photos"}
        </label>
        <label
          htmlFor="recipe-photo-camera"
          className={`inline-block cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-medium ${busy ? "border-stone-200 text-stone-400" : "border-stone-300 hover:bg-stone-100"}`}
        >
          📷 Take a picture
        </label>
        <span className="hidden text-xs text-stone-400 sm:inline">
          or drag &amp; drop / click here and paste (Ctrl+V)
        </span>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
