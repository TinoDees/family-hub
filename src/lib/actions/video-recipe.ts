"use server";

import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/module-guard";
import type { ScannedRecipe } from "@/lib/actions/recipe-scan";

const GEMINI_BASE = "https://generativelanguage.googleapis.com";
const MODEL = "gemini-2.5-flash";

const RECIPE_PROMPT = `Watch this cooking video (including the narration and any on-screen text) and write the recipe. Reply with ONLY a JSON object, no other text:
{"name": string, "description": string|null, "servings": number|null,
 "prep_minutes": number|null, "cook_minutes": number|null,
 "ingredients": [{"qty": string, "unit": string, "name": string, "note": string}],
 "instructions": string, "tags": [string]}
Rules: qty is the number as a string ("500", "1.5", "" if not stated); unit like "g","ml","tbsp","" if none;
capture EVERY ingredient mentioned or shown, estimate quantities from the video if not stated (note "estimated" in the note field);
instructions as numbered steps separated by newlines, in the order performed; tags are 2-4 lowercase words.
If the video contains no recipe, reply {"name": null}.`;

function parseRecipeJson(text: string): ScannedRecipe {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return { ok: false, error: "Could not read a recipe from the video" };
  const p = JSON.parse(match[0]);
  if (!p.name) return { ok: false, error: "No recipe found in that video" };
  return {
    ok: true,
    name: String(p.name),
    description: p.description ? String(p.description) : undefined,
    servings: typeof p.servings === "number" ? p.servings : undefined,
    prep_minutes: typeof p.prep_minutes === "number" ? p.prep_minutes : undefined,
    cook_minutes: typeof p.cook_minutes === "number" ? p.cook_minutes : undefined,
    ingredients: Array.isArray(p.ingredients)
      ? p.ingredients.map((i: Record<string, unknown>) => ({
          qty: String(i.qty ?? ""),
          unit: String(i.unit ?? ""),
          name: String(i.name ?? ""),
          note: String(i.note ?? ""),
        }))
      : undefined,
    instructions: p.instructions ? String(p.instructions) : undefined,
    tags: Array.isArray(p.tags) ? p.tags.map(String) : undefined,
  };
}

async function generateFromPart(part: unknown, key: string): Promise<ScannedRecipe> {
  const res = await fetch(`${GEMINI_BASE}/v1beta/models/${MODEL}:generateContent?key=${key}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [part, { text: RECIPE_PROMPT }] }],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    return { ok: false, error: `Gemini failed (${res.status}): ${body.slice(0, 200)}` };
  }
  const data = await res.json();
  const text: string =
    data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
  try {
    return parseRecipeJson(text);
  } catch {
    return { ok: false, error: "Could not parse the recipe — try again" };
  }
}

/** YouTube links go straight to Gemini — no upload needed. */
export async function recipeFromYouTube(url: string): Promise<ScannedRecipe> {
  await requireModule("recipes", "edit");
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { ok: false, error: "Video reading needs GEMINI_API_KEY" };
  if (!/^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(url.trim()))
    return { ok: false, error: "That doesn't look like a YouTube link" };
  return generateFromPart({ file_data: { file_uri: url.trim() } }, key);
}

/** Uploaded video: pull from our temp bucket, hand to Gemini Files API, read, clean up. */
export async function recipeFromVideo(storagePath: string): Promise<ScannedRecipe> {
  const { membership } = await requireModule("recipes", "edit");
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { ok: false, error: "Video reading needs GEMINI_API_KEY" };
  if (!storagePath.startsWith(`${membership.household_id}/`))
    return { ok: false, error: "Invalid path" };

  const supabase = await createClient();
  const { data: blob, error: dlErr } = await supabase.storage.from("video-temp").download(storagePath);
  if (dlErr || !blob) return { ok: false, error: dlErr?.message ?? "Could not read the upload" };
  const bytes = Buffer.from(await blob.arrayBuffer());
  const mime = blob.type || "video/mp4";

  let fileName: string | null = null;
  try {
    // 1. start resumable upload
    const start = await fetch(`${GEMINI_BASE}/upload/v1beta/files?key=${key}`, {
      method: "POST",
      headers: {
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": String(bytes.length),
        "X-Goog-Upload-Header-Content-Type": mime,
        "content-type": "application/json",
      },
      body: JSON.stringify({ file: { display_name: "nestly-recipe-video" } }),
    });
    const uploadUrl = start.headers.get("x-goog-upload-url");
    if (!start.ok || !uploadUrl) return { ok: false, error: `Gemini upload failed (${start.status})` };

    // 2. send the bytes
    const up = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "X-Goog-Upload-Offset": "0",
        "X-Goog-Upload-Command": "upload, finalize",
        "content-length": String(bytes.length),
      },
      body: bytes,
    });
    if (!up.ok) return { ok: false, error: `Gemini upload failed (${up.status})` };
    const uploaded = await up.json();
    fileName = uploaded?.file?.name ?? null;
    let fileUri = uploaded?.file?.uri;
    let state = uploaded?.file?.state;

    // 3. wait until processed
    const deadline = Date.now() + 90_000;
    while (state === "PROCESSING" && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 3000));
      const poll = await fetch(`${GEMINI_BASE}/v1beta/${fileName}?key=${key}`);
      const f = await poll.json();
      state = f?.state;
      fileUri = f?.uri ?? fileUri;
    }
    if (state !== "ACTIVE") return { ok: false, error: "Video processing timed out — try a shorter clip" };

    // 4. read the recipe
    return await generateFromPart({ file_data: { mime_type: mime, file_uri: fileUri } }, key);
  } finally {
    // clean up both copies
    supabase.storage.from("video-temp").remove([storagePath]).then(() => {});
    if (fileName) {
      fetch(`${GEMINI_BASE}/v1beta/${fileName}?key=${key}`, { method: "DELETE" }).catch(() => {});
    }
  }
}
