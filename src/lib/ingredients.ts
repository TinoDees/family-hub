/**
 * Loose ingredient-line parsing — the "brain-dump" parser.
 *
 * Kati's rule: entering ingredients must be as easy as thinking about shopping.
 * One ingredient per line, quantities optional. "500g beef mince" parses into
 * qty/unit/name; "gherkins" is just a name — both are equally valid.
 *
 * This is the ONLY place ingredient text is parsed (same single-source rule as
 * src/lib/rules.ts). CSV/URL/scan importers that need loose parsing use this.
 */

export type ParsedIngredient = {
  name: string;
  qty: number | null;
  unit: string | null;
};

/** Recognised unit tokens → canonical form. Anything else stays in the name. */
const UNIT_MAP: Record<string, string> = {
  g: "g", gram: "g", grams: "g", gr: "g",
  kg: "kg", kilo: "kg", kilos: "kg", kilogram: "kg", kilograms: "kg",
  mg: "mg",
  ml: "ml", milliliter: "ml", millilitre: "ml", milliliters: "ml", millilitres: "ml",
  l: "l", liter: "l", litre: "l", liters: "l", litres: "l",
  tsp: "tsp", teaspoon: "tsp", teaspoons: "tsp",
  tbsp: "tbsp", tablespoon: "tbsp", tablespoons: "tbsp", tbs: "tbsp",
  cup: "cup", cups: "cup",
  piece: "piece", pieces: "piece", pc: "piece", pcs: "piece", stück: "piece", stk: "piece",
  tin: "tin", tins: "tin", can: "can", cans: "can", jar: "jar", jars: "jar",
  pack: "pack", packs: "pack", packet: "pack", packets: "pack", punnet: "punnet", punnets: "punnet",
  bunch: "bunch", bunches: "bunch", clove: "clove", cloves: "clove",
  slice: "slice", slices: "slice", stick: "stick", sticks: "stick",
  pinch: "pinch", handful: "handful", handfuls: "handful", sprig: "sprig", sprigs: "sprig",
  bottle: "bottle", bottles: "bottle", loaf: "loaf", loaves: "loaf",
  bag: "bag", bags: "bag", head: "head", heads: "head",
};

function parseNumber(raw: string): number | null {
  const s = raw.trim().replace(",", ".");
  // simple fraction: "1/2", "3 / 4"
  const frac = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (frac) {
    const d = parseInt(frac[2]);
    return d ? Math.round((parseInt(frac[1]) / d) * 1000) / 1000 : null;
  }
  // mixed: "1 1/2"
  const mixed = s.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixed) {
    const d = parseInt(mixed[3]);
    return d ? parseInt(mixed[1]) + Math.round((parseInt(mixed[2]) / d) * 1000) / 1000 : null;
  }
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

/** Parse a single free-typed line. Never throws; worst case the line is all name. */
export function parseIngredientLine(line: string): ParsedIngredient | null {
  const s = line.trim().replace(/^[-*•·]\s*/, ""); // allow "- beef" bullet style
  if (!s) return null;

  // leading quantity: "500g x", "1/2 x", "1 1/2 cups x", "2 x chicken"
  const m = s.match(/^((?:\d+\s+\d+\s*\/\s*\d+)|(?:\d+\s*\/\s*\d+)|(?:\d+(?:[.,]\d+)?))\s*(.*)$/);
  if (!m) return { name: s.slice(0, 200), qty: null, unit: null };

  const qty = parseNumber(m[1]);
  let rest = m[2].trim();
  if (qty === null) return { name: s.slice(0, 200), qty: null, unit: null };

  // optional "x" multiplier style: "2 x chicken breast"
  rest = rest.replace(/^x\s+/i, "");

  // unit glued or spaced: "g beef", "kg beef", "cups flour"
  const um = rest.match(/^([a-zA-ZäöüÄÖÜß]+)\.?\s*(.*)$/);
  if (um) {
    const unitToken = um[1].toLowerCase();
    const canonical = UNIT_MAP[unitToken];
    if (canonical && um[2].trim()) {
      return { name: um[2].trim().slice(0, 200), qty, unit: canonical };
    }
    // "1 onion" → no unit, "onion" is the name (with whatever follows)
    if (rest) return { name: rest.slice(0, 200), qty, unit: null };
  }
  if (rest) return { name: rest.slice(0, 200), qty, unit: null };
  // a bare number line — treat the whole thing as a name to avoid losing input
  return { name: s.slice(0, 200), qty: null, unit: null };
}

/** Parse a brain-dump textarea: one ingredient per line, blanks ignored. */
export function parseIngredientLines(text: string): ParsedIngredient[] {
  return text
    .split(/\r?\n/)
    .map(parseIngredientLine)
    .filter((i): i is ParsedIngredient => i !== null && i.name.length > 0)
    .slice(0, 60);
}

/**
 * Clean an ingredient name for SHOPPING purposes (imported recipes are full of
 * cookbook noise). Returns 0..2 shoppable names:
 *   "option 2:" / "See notes"        → []           (not ingredients)
 *   "pinch of salt"                  → ["salt"]     (a pinch is a measure)
 *   "salt and pepper to taste"       → ["salt", "pepper"]
 *   "olive oil, for serving"         → ["olive oil"]
 * Used everywhere recipe ingredients become shopping rows (plan, list gen,
 * week summary) — the single place this logic lives.
 */
export function normalizeIngredientNames(raw: string): string[] {
  let s = raw.trim().replace(/^[-*•·]\s*/, "");
  if (!s) return [];

  // whole lines that are structure, not ingredients
  if (/^option\s*\d*\s*:?\s*$/i.test(s)) return [];
  if (/^(see\s+)?notes?\s*:?\s*$/i.test(s)) return [];
  if (/^(for\s+(the\s+)?(serving|garnish|dressing|sauce|marinade|topping))\s*:?\s*$/i.test(s)) return [];

  // strip measure-words that aren't quantities you can buy
  s = s.replace(/^(a\s+)?(pinch(es)?|dash(es)?|splash(es)?|sprinkle)\s+of\s+/i, "");
  // strip cookbook qualifiers
  s = s.replace(/\s*\((optional|to taste|for serving|if desired|as needed)\)\s*/gi, " ");
  s = s.replace(/,?\s+(to taste|to serve|for serving|for garnish|if desired|as needed|or more|to drizzle(\s+over\s+(the\s+)?top)?)\s*\.?$/i, "");
  s = s.replace(/,?\s+(to taste|to serve|for serving|for garnish|if desired|as needed|or more|to drizzle(\s+over\s+(the\s+)?top)?)\s*\.?$/i, ""); // twice: "to drizzle over top if desired"
  s = s.replace(/^extra\s+/i, "").replace(/\s+/g, " ").trim();
  if (!s) return [];

  // "salt and pepper" style pairs → two real items
  const pair = s.toLowerCase().match(/^(salt)\s*(?:and|&|\+)\s*(pepper)$|^(pepper)\s*(?:and|&|\+)\s*(salt)$/);
  if (pair) return ["salt", "pepper"];

  return [s.slice(0, 200)];
}
