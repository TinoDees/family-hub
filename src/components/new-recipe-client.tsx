"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { RecipeForm } from "@/components/recipe-form";
import { createRecipe } from "@/lib/actions/recipes";
import { scanRecipeImage, type ScannedRecipe } from "@/lib/actions/recipe-scan";
import { recipeFromVideo, recipeFromYouTube } from "@/lib/actions/video-recipe";
import { recipeFromUrl } from "@/lib/actions/recipe-from-url";
import { createClient } from "@/lib/supabase/client";

const DocScannerModal = dynamic(() => import("@/components/doc-scanner-modal"), { ssr: false });

async function toBase64(file: File): Promise<{ data: string; mediaType: string }> {
  const buf = await file.arrayBuffer();
  let binary = "";
  const arr = new Uint8Array(buf);
  for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]);
  return { data: btoa(binary), mediaType: file.type || "image/jpeg" };
}

export function NewRecipeClient({
  householdId,
  initialUrl,
  initialVideoPath,
}: {
  householdId: string;
  /** pre-filled by the Android share target — auto-reads on load */
  initialUrl?: string;
  /** a video file already uploaded by the share target — auto-processes */
  initialVideoPath?: string;
}) {
  const [youtubeUrl, setYoutubeUrl] = useState(initialUrl ?? "");
  const [autoRan, setAutoRan] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [scanned, setScanned] = useState<ScannedRecipe | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [videoPath, setVideoPath] = useState<string | null>(null);
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

  const applyResult = (res: ScannedRecipe) => {
    if (!res.ok) {
      setMsg(res.error ?? "Could not read the recipe");
      return;
    }
    setScanned(res);
    setVersion((v) => v + 1);
    setMsg(`Read "${res.name}" — check everything, then save.`);
  };

  const onVideo = async (file: File) => {
    if (file.size > 100 * 1024 * 1024) {
      setMsg("Video too large (max 100 MB) — trim it or use a shorter clip.");
      return;
    }
    setScanning(true);
    setMsg("Uploading video…");
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop() || "mp4";
      const path = `${householdId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("video-temp")
        .upload(path, file, { contentType: file.type || "video/mp4" });
      if (error) {
        setMsg(`Upload failed: ${error.message}`);
        return;
      }
      setMsg("Watching the video… this takes up to a minute.");
      const res = await recipeFromVideo(path);
      if (res.ok && res.video_path) setVideoPath(res.video_path);
      applyResult(res);
    } finally {
      setScanning(false);
    }
  };

  const onLink = async (raw?: string) => {
    const url = (raw ?? youtubeUrl).trim();
    if (!url) return;
    const isYouTube = /^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(url);
    setScanning(true);
    setMsg(isYouTube ? "Watching the video… this takes up to a minute." : "Reading the page…");
    try {
      const res = isYouTube ? await recipeFromYouTube(url) : await recipeFromUrl(url);
      if (res.ok) setSourceUrl(url);
      applyResult(res);
    } finally {
      setScanning(false);
    }
  };

  // share-target flow: auto-read the shared link / video once
  if ((initialUrl || initialVideoPath) && !autoRan) {
    setAutoRan(true);
    if (initialVideoPath) {
      setTimeout(async () => {
        setScanning(true);
        setMsg("Watching your shared video… this takes up to a minute.");
        try {
          const res = await recipeFromVideo(initialVideoPath);
          if (res.ok && res.video_path) setVideoPath(res.video_path);
          applyResult(res);
        } finally {
          setScanning(false);
        }
      }, 0);
    } else if (initialUrl) {
      setTimeout(() => onLink(initialUrl), 0);
    }
  }

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
        <label className="cursor-pointer rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium hover:bg-stone-100">
          🎬 From a video
          <input
            type="file"
            accept="video/*"
            className="hidden"
            disabled={scanning}
            onChange={(e) => e.target.files?.[0] && onVideo(e.target.files[0])}
          />
        </label>
        <div className="flex min-w-64 flex-1 items-center gap-2">
          <input
            value={youtubeUrl}
            onChange={(e) => setYoutubeUrl(e.target.value)}
            placeholder="…or paste a link (recipe page or YouTube)"
            autoComplete="off"
            className="flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm placeholder:text-stone-400"
          />
          <button
            type="button"
            disabled={scanning || !youtubeUrl.trim()}
            onClick={() => onLink()}
            className="rounded-lg border border-stone-300 px-3 py-2 text-sm font-medium hover:bg-stone-100 disabled:opacity-40"
          >
            Read
          </button>
        </div>
        <span className="w-full text-xs text-stone-400">
          Cookbook pages, screenshots, saved videos, YouTube links — or any recipe website link. On Android you can share a page straight to the Nestly app.
        </span>
      </div>

      <details className="rounded-xl border border-stone-200 bg-white">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-stone-600">
          📘 How do I get a Facebook or Instagram recipe in?
        </summary>
        <div className="space-y-2 border-t border-stone-100 px-4 py-3 text-sm text-stone-600">
          <p>
            Facebook and Instagram don&apos;t let any app read their videos — so we record the
            screen instead. It takes 30 seconds:
          </p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Open the recipe video and turn the volume on.</li>
            <li>
              <strong>Android:</strong> swipe down from the top twice → tap{" "}
              <strong>Screen recorder</strong> → play the video from the start.
              <br />
              <strong>iPhone:</strong> Control Centre → tap the record button ◉ → play the video.
            </li>
            <li>Stop recording when it&apos;s done (tap the red timer).</li>
            <li>
              Open your Gallery → find the recording → <strong>Share → Nestly</strong> (or use
              &ldquo;From a video&rdquo; above). Nestly watches it and writes the recipe.
            </li>
          </ol>
          <p className="text-xs text-stone-400">
            The narration matters — most quantities are spoken, so record with sound.
          </p>
        </div>
      </details>
      {msg && <p className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800">{msg}</p>}

      <RecipeForm
        key={version}
        action={createRecipe}
        submitLabel="Save recipe"
        recipe={
          scanned
            ? {
                source_url: sourceUrl,
                video_path: videoPath,
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
