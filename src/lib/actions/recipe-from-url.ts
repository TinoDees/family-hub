"use server";

import { requireModule } from "@/lib/module-guard";
import type { ScannedRecipe } from "@/lib/actions/recipe-scan";

function parseIsoDuration(d: unknown): number | undefined {
  if (typeof d !== "string") return undefined;
  const m = d.match(/^PT(?:(\d+)H)?(?:(\d+)M)?/i);
  if (!m) return undefined;
  const mins = (parseInt(m[1] ?? "0") || 0) * 60 + (parseInt(m[2] ?? "0") || 0);
  return mins > 0 ? mins : undefined;
}

function parseIngredientLine(line: string) {
  // "500 g beef mince" / "2 tbsp olive oil" / "salt"
  const m = line.trim().match(/^([\d.,/½¼¾]+)?\s*([a-zA-Z]{0,12})?\s+(.*)$/);
  if (m && m[1]) {
    const qtyRaw = m[1].replace(",", ".").replace("½", "0.5").replace("¼", "0.25").replace("¾", "0.75");
    const qty = qtyRaw.includes("/")
      ? (() => {
          const [a, b] = qtyRaw.split("/").map(Number);
          return b ? a / b : NaN;
        })()
      : parseFloat(qtyRaw);
    const knownUnits = /^(g|kg|ml|l|tsp|tbsp|cup|cups|oz|lb|clove|cloves|slice|slices|can|cans|bunch|pinch|pcs?|stück|el|tl)$/i;
    const unit = m[2] && knownUnits.test(m[2]) ? m[2].toLowerCase() : "";
    const name = unit ? m[3] : `${m[2] ?? ""} ${m[3] ?? ""}`.trim();
    if (!isNaN(qty) && name) return { qty: String(qty), unit, name, note: "" };
  }
  return { qty: "", unit: "", name: line.trim(), note: "" };
}

type JsonLdRecipe = {
  "@type"?: unknown;
  name?: unknown;
  description?: unknown;
  recipeYield?: unknown;
  prepTime?: unknown;
  cookTime?: unknown;
  recipeIngredient?: unknown;
  recipeInstructions?: unknown;
  keywords?: unknown;
};

function findRecipeNode(node: unknown): JsonLdRecipe | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const r = findRecipeNode(n);
      if (r) return r;
    }
    return null;
  }
  const obj = node as Record<string, unknown>;
  const type = obj["@type"];
  if (type === "Recipe" || (Array.isArray(type) && type.includes("Recipe"))) return obj as JsonLdRecipe;
  if (obj["@graph"]) return findRecipeNode(obj["@graph"]);
  return null;
}

function fromJsonLd(r: JsonLdRecipe): ScannedRecipe {
  const yieldRaw = Array.isArray(r.recipeYield) ? r.recipeYield[0] : r.recipeYield;
  const servings = typeof yieldRaw === "number" ? yieldRaw : parseInt(String(yieldRaw ?? "")) || undefined;
  const ingredients = Array.isArray(r.recipeIngredient)
    ? (r.recipeIngredient as unknown[]).map((l) => parseIngredientLine(String(l)))
    : undefined;
  let instructions: string | undefined;
  if (Array.isArray(r.recipeInstructions)) {
    instructions = (r.recipeInstructions as unknown[])
      .map((step, i) => {
        const t =
          typeof step === "string"
            ? step
            : String((step as Record<string, unknown>)?.text ?? "");
        return t ? `${i + 1}. ${t}` : "";
      })
      .filter(Boolean)
      .join("\n");
  } else if (typeof r.recipeInstructions === "string") {
    instructions = r.recipeInstructions;
  }
  return {
    ok: true,
    name: String(r.name ?? "Recipe"),
    description: r.description ? String(r.description).slice(0, 300) : undefined,
    servings,
    prep_minutes: parseIsoDuration(r.prepTime),
    cook_minutes: parseIsoDuration(r.cookTime),
    ingredients,
    instructions,
    tags: typeof r.keywords === "string"
      ? r.keywords.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 4)
      : undefined,
  };
}

/** Read a recipe web page: schema.org JSON-LD when available, Claude otherwise. */
export async function recipeFromUrl(url: string): Promise<ScannedRecipe> {
  await requireModule("recipes", "edit");
  const clean = url.trim();
  if (!/^https?:\/\//i.test(clean)) return { ok: false, error: "That doesn't look like a link" };

  // TikTok: the caption (via public oEmbed) very often contains the whole recipe
  if (/tiktok\.com\//i.test(clean)) {
    let caption = "";
    try {
      // share-sheet links are shorteners (vt.tiktok.com/…) — resolve to the real video URL first
      let resolved = clean;
      if (!/tiktok\.com\/@[^/]+\/video\//i.test(clean)) {
        try {
          const r = await fetch(clean, {
            headers: { "user-agent": "Mozilla/5.0 (Linux; Android 14) Chrome/126 Mobile" },
            redirect: "follow",
            signal: AbortSignal.timeout(10000),
          });
          if (r.url && /tiktok\.com/i.test(r.url)) resolved = r.url.split("?")[0];
        } catch {
          /* keep the original */
        }
      }
      const oe = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(resolved)}`, {
        signal: AbortSignal.timeout(10000),
      });
      if (oe.ok) {
        const meta = await oe.json();
        caption = String(meta?.title ?? "");
        if (caption.trim().length > 80) {
          const fromCaption = await readTextWithClaude(
            `TikTok video caption by ${meta?.author_name ?? "unknown"}:\n${caption}`
          );
          if (fromCaption.ok) return fromCaption;
        }
      }
    } catch {
      /* fall through to the advice below */
    }
    const titleHint = caption
      ? ` The caption only says: "${caption.replace(/#\S+/g, "").trim().slice(0, 80)}…"`
      : "";
    return {
      ok: false,
      error: `This TikTok's caption doesn't contain the full recipe.${titleHint} Save the video in TikTok (Share → Save video), then share the saved file to Nestly — I'll watch it and fill in everything.`,
    };
  }

  const isFacebook = /(facebook\.com|fb\.watch)\//i.test(clean);

  let html = "";
  try {
    const res = await fetch(clean, {
      headers: isFacebook
        ? { "user-agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)" }
        : {
            // look like a normal browser — many news-corp era sites 403 plain bots
            "user-agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
            accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "accept-language": "en-AU,en;q=0.9",
          },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok && !isFacebook) {
      if ([403, 429, 503].includes(res.status)) {
        return {
          ok: false,
          error:
            "This website blocks automated readers. Easy workaround: screenshot the recipe on the page (ingredients + method) and use 'From a screenshot' — that always works.",
        };
      }
      return { ok: false, error: `Could not open the page (${res.status})` };
    }
    html = res.ok ? await res.text() : "";
  } catch {
    if (!isFacebook) return { ok: false, error: "Could not reach that page — check the link" };
  }

  if (isFacebook) {
    // best effort: og:description sometimes carries the caption for public posts
    const og = [...html.matchAll(/<meta[^>]+(?:property|name)=["']og:description["'][^>]+content=["']([^"']+)["']/gi)]
      .map((m) => m[1])
      .join("\n");
    if (og.trim().length > 80) {
      const fromCaption = await readTextWithClaude(`Facebook post caption:\n${og}`);
      if (fromCaption.ok) return fromCaption;
    }
    return {
      ok: false,
      error:
        "Facebook keeps its posts behind a login, so I can't read this link. Save the video in Facebook (or screen-record it), then share the file to Nestly — I'll watch it and build the card.",
    };
  }

  // 1. structured data (most recipe sites have it) — free and exact
  const ldBlocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const block of ldBlocks) {
    try {
      const node = JSON.parse(block[1]);
      const recipe = findRecipeNode(node);
      if (recipe?.name) return fromJsonLd(recipe);
    } catch {
      /* malformed block — keep looking */
    }
  }

  // 2. fall back to Claude over the page text (og: description tags included —
  //    that's where Facebook/Instagram put captions when pages are JS-rendered)
  const ogParts = [...html.matchAll(/<meta[^>]+(?:property|name)=["']og:(?:title|description)["'][^>]+content=["']([^"']+)["']/gi)]
    .map((m) => m[1])
    .join("\n");
  const text = (ogParts + "\n" + html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " "))
    .slice(0, 30000);
  return readTextWithClaude(text);
}

/** Claude over plain text → our recipe schema. */
async function readTextWithClaude(text: string): Promise<ScannedRecipe> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { ok: false, error: "No structured recipe found and ANTHROPIC_API_KEY is not set" };
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2000,
        messages: [
          {
            role: "user",
            content: `Extract the recipe from this web page text. Reply with ONLY JSON:
{"name": string, "description": string|null, "servings": number|null, "prep_minutes": number|null, "cook_minutes": number|null,
 "ingredients": [{"qty": string, "unit": string, "name": string, "note": string}], "instructions": string, "tags": [string]}
instructions = numbered steps separated by newlines. If no recipe: {"name": null}.

PAGE TEXT:
${text}`,
          },
        ],
      }),
    });
    if (!res.ok) return { ok: false, error: `AI reading failed (${res.status})` };
    const data = await res.json();
    let out: string = data?.content?.[0]?.text ?? "";
    out = out.replace(/```(?:json)?/g, "").trim();
    const match = out.match(/\{[\s\S]*\}/);
    if (!match) return { ok: false, error: "Could not find a recipe on that page" };
    const p = JSON.parse(match[0]);
    if (!p.name) return { ok: false, error: "No recipe found on that page" };
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
    return { ok: false, error: "Could not read a recipe from that page" };
  }
}
