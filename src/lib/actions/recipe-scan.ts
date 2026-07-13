"use server";

import { requireModule } from "@/lib/module-guard";

export type ScannedRecipe = {
  ok: boolean;
  error?: string;
  name?: string;
  description?: string;
  servings?: number;
  prep_minutes?: number;
  cook_minutes?: number;
  ingredients?: { qty: string; unit: string; name: string; note: string }[];
  instructions?: string;
  tags?: string[];
};

/** Read a cookbook page / recipe screenshot with Claude into a structured recipe. */
export async function scanRecipeImage(
  imageBase64: string,
  mediaType: string
): Promise<ScannedRecipe> {
  await requireModule("recipes", "edit");

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { ok: false, error: "Recipe scanning needs ANTHROPIC_API_KEY" };

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 2000,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mediaType, data: imageBase64 },
              },
              {
                type: "text",
                text: `Read the recipe in this image. It may be HANDWRITTEN and may be ROTATED sideways — mentally rotate if needed and read handwriting carefully, inferring unclear words from cooking context. Reply with ONLY a JSON object, no other text:
{"name": string, "description": string|null, "servings": number|null,
 "prep_minutes": number|null, "cook_minutes": number|null,
 "ingredients": [{"qty": string, "unit": string, "name": string, "note": string}],
 "instructions": string, "tags": [string]}
Rules: qty is the number as a string ("500", "1.5", "" if none); unit like "g","ml","tbsp","" if none;
instructions as numbered steps separated by newlines; tags are 2-4 lowercase words like "dinner","beef".
If no recipe is visible, reply {"name": null}.`,
              },
            ],
          },
        ],
      }),
    });
    if (!res.ok) return { ok: false, error: `AI reading failed (${res.status})` };
    const data = await res.json();
    const text: string = data?.content?.[0]?.text ?? "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return { ok: false, error: "Could not read a recipe from that image" };
    const p = JSON.parse(match[0]);
    if (!p.name) return { ok: false, error: "No recipe found in that image" };
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
  } catch {
    return { ok: false, error: "AI reading failed — try a clearer photo" };
  }
}
