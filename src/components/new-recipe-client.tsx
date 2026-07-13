"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { RecipeForm } from "@/components/recipe-form";
import { createRecipe } from "@/lib/actions/recipes";
import { scanRecipeImage, type ScannedRecipe } from "@/lib/actions/recipe-scan";

const DocScannerModal = dynamic(() => import("@/components/doc-scanner-modal"), { ssr: false });

async function toBase64(file: File): Promise<{ data: string; mediaType: string }> {
  const buf = await file.arrayBuffer();
  let binary = "";
  const arr = new Uint8Array(buf);
  for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]);
  return { data: btoa(binary), mediaType: file.type || "image/jpeg" };
}

export function NewRecipeClient() {
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [scanned, setScanned] = useState<ScannedRecipe | null>(null);
  const [version, setVersion] = useState(0);

  const onCapture = async (file: File) => {
    setScannerOpen(false);
    setScanning(true);
    setMsg("Reading recipe…");
    try {
      const { data, mediaType } = await toBase64(file);
      const res = await scanRecipeImage(data, mediaType);
      if (!res.ok) {
        setMsg(res.error ?? "Could not read the recipe");
        return;
      }
      setScanned(res);
      setVersion((v) => v + 1);
      setMsg(`Read "${res.name}" — check everything, then save.`);
    } finally {
      setScanning(false);
    }
  };

  // also allow choosing an existing photo/screenshot (e.g. TikTok caption screenshot)
  const onPick = async (file: File) => {
    setScanning(true);
    setMsg("Reading image…");
    try {
      const { data, mediaType } = await toBase64(file);
      const res = await scanRecipeImage(data, mediaType);
      if (!res.ok) {
        setMsg(res.error ?? "Could not read the recipe");
        return;
      }
      setScanned(res);
      setVersion((v) => v + 1);
      setMsg(`Read "${res.name}" — check everything, then save.`);
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="space-y-4">
      {scannerOpen && (
        <DocScannerModal onClose={() => setScannerOpen(false)} onCapture={onCapture} />
      )}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-stone-200 bg-white p-4">
        <button
          type="button"
          disabled={scanning}
          onClick={() => setScannerOpen(true)}
          className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-40"
        >
          {scanning ? "Reading…" : "📷 Scan a cookbook page"}
        </button>
        <label className="cursor-pointer rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium hover:bg-stone-100">
          🖼 From a screenshot
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={scanning}
            onChange={(e) => e.target.files?.[0] && onPick(e.target.files[0])}
          />
        </label>
        <span className="text-xs text-stone-400">
          Cookbook pages, recipe cards, or screenshots of TikTok/Instagram captions.
        </span>
      </div>
      {msg && <p className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800">{msg}</p>}

      <RecipeForm
        key={version}
        action={createRecipe}
        submitLabel="Save recipe"
        recipe={
          scanned
            ? {
                name: scanned.name,
                description: scanned.description ?? null,
                servings: scanned.servings ?? 4,
                prep_minutes: scanned.prep_minutes ?? null,
                cook_minutes: scanned.cook_minutes ?? null,
                instructions: scanned.instructions ?? null,
                tags: scanned.tags ?? [],
                ingredients: scanned.ingredients,
              }
            : undefined
        }
      />
    </div>
  );
}
