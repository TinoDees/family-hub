/**
 * Grocery categories — the single source (same one-place rule as rules.ts and
 * ingredients.ts). Used by the pantry, shopping lists and the planner's
 * list generation. Order = a sensible default supermarket walk (produce first,
 * frozen late, cleaning last); S3 replaces this with per-store aisle order.
 */

export type GroceryCategory = {
  id: string;
  label: string;
  emoji: string;
};

export const GROCERY_CATEGORIES: GroceryCategory[] = [
  { id: "produce", label: "Fruit & Veg", emoji: "🥕" },
  { id: "bakery", label: "Bakery", emoji: "🥖" },
  { id: "meat", label: "Meat & Seafood", emoji: "🥩" },
  { id: "deli", label: "Deli", emoji: "🧀" },
  { id: "dairy", label: "Dairy & Eggs", emoji: "🥛" },
  { id: "pantry", label: "Pantry", emoji: "🥫" },
  { id: "frozen", label: "Frozen", emoji: "🧊" },
  { id: "drinks", label: "Drinks", emoji: "🧃" },
  { id: "snacks", label: "Snacks", emoji: "🍿" },
  { id: "baby", label: "Baby", emoji: "🍼" },
  { id: "pet", label: "Pet", emoji: "🐾" },
  { id: "cleaning", label: "Cleaning & Household", emoji: "🧽" },
  { id: "personal", label: "Personal Care", emoji: "🧴" },
  { id: "other", label: "Other", emoji: "🛒" },
];

export const CATEGORY_ORDER: string[] = GROCERY_CATEGORIES.map((c) => c.id);

export function categoryById(id: string | null | undefined): GroceryCategory {
  return GROCERY_CATEGORIES.find((c) => c.id === id) ?? GROCERY_CATEGORIES[GROCERY_CATEGORIES.length - 1];
}

/** keyword → category. First match wins; keep keywords lowercase. */
const KEYWORDS: [string, string][] = [
  // produce
  ["apple", "produce"], ["banana", "produce"], ["berry", "produce"], ["berries", "produce"],
  ["blueberr", "produce"], ["strawberr", "produce"], ["raspberr", "produce"], ["orange", "produce"],
  ["lemon", "produce"], ["lime", "produce"], ["grape", "produce"], ["mango", "produce"],
  ["avocado", "produce"], ["tomato", "produce"], ["potato", "produce"], ["kartoffel", "produce"],
  ["onion", "produce"], ["zwiebel", "produce"], ["garlic", "produce"], ["carrot", "produce"],
  ["lettuce", "produce"], ["salad leaves", "produce"], ["spinach", "produce"], ["broccoli", "produce"],
  ["cauliflower", "produce"], ["zucchini", "produce"], ["capsicum", "produce"], ["cucumber", "produce"],
  ["gurke", "produce"], ["mushroom", "produce"], ["pumpkin", "produce"], ["celery", "produce"],
  ["herb", "produce"], ["parsley", "produce"], ["coriander", "produce"], ["basil", "produce"],
  ["ginger", "produce"], ["chilli", "produce"], ["cabbage", "produce"], ["kohl", "produce"],
  ["bean sprout", "produce"], ["eggplant", "produce"], ["corn cob", "produce"], ["fruit", "produce"],
  // bakery
  ["bread", "bakery"], ["brot", "bakery"], ["broetchen", "bakery"], ["brötchen", "bakery"],
  ["roll", "bakery"], ["bagel", "bakery"], ["croissant", "bakery"], ["wrap", "bakery"],
  ["tortilla", "bakery"], ["bun", "bakery"], ["baguette", "bakery"], ["pita", "bakery"],
  // meat & seafood
  ["beef", "meat"], ["mince", "meat"], ["steak", "meat"], ["chicken", "meat"], ["pork", "meat"],
  ["lamb", "meat"], ["bacon", "meat"], ["sausage", "meat"], ["wurst", "meat"], ["bratwurst", "meat"],
  ["schnitzel", "meat"], ["fleisch", "meat"], ["turkey", "meat"], ["duck", "meat"],
  ["fish", "meat"], ["salmon", "meat"], ["tuna fresh", "meat"], ["prawn", "meat"], ["shrimp", "meat"],
  ["seafood", "meat"], ["kassler", "meat"], ["speck", "meat"], ["drumstick", "meat"],
  // deli
  ["ham", "deli"], ["salami", "deli"], ["prosciutto", "deli"], ["olives", "deli"],
  ["pate", "deli"], ["dip", "deli"], ["hummus", "deli"], ["leberwurst", "deli"],
  ["cheese slice", "deli"], ["brie", "deli"], ["camembert", "deli"],
  // dairy & eggs
  ["milk", "dairy"], ["milch", "dairy"], ["butter", "dairy"], ["cheese", "dairy"],
  ["käse", "dairy"], ["kaese", "dairy"], ["yoghurt", "dairy"], ["yogurt", "dairy"],
  ["cream", "dairy"], ["sahne", "dairy"], ["quark", "dairy"], ["egg", "dairy"], ["eier", "dairy"],
  // frozen
  ["frozen", "frozen"], ["ice cream", "frozen"], ["icecream", "frozen"], ["eis", "frozen"],
  ["fish finger", "frozen"], ["frozen pea", "frozen"],
  // drinks
  ["water", "drinks"], ["juice", "drinks"], ["saft", "drinks"], ["soft drink", "drinks"],
  ["cola", "drinks"], ["lemonade", "drinks"], ["beer", "drinks"], ["bier", "drinks"],
  ["wine", "drinks"], ["wein", "drinks"], ["coffee bean", "drinks"], ["tea bag", "drinks"],
  ["cordial", "drinks"], ["kombucha", "drinks"],
  // snacks
  ["chips", "snacks"], ["crisps", "snacks"], ["chocolate", "snacks"], ["schokolade", "snacks"],
  ["lolly", "snacks"], ["lollies", "snacks"], ["biscuit", "snacks"], ["cookie", "snacks"],
  ["cracker", "snacks"], ["muesli bar", "snacks"], ["popcorn", "snacks"], ["nuts", "snacks"],
  ["pretzel", "snacks"], ["gummi", "snacks"],
  // baby
  ["nappy", "baby"], ["nappies", "baby"], ["diaper", "baby"], ["formula", "baby"],
  ["baby food", "baby"], ["wipes", "baby"],
  // pet
  ["dog food", "pet"], ["cat food", "pet"], ["pet food", "pet"], ["kitty litter", "pet"],
  ["dog treat", "pet"], ["bird seed", "pet"],
  // cleaning & household
  ["toilet paper", "cleaning"], ["paper towel", "cleaning"], ["tissue", "cleaning"],
  ["detergent", "cleaning"], ["dishwash", "cleaning"], ["washing powder", "cleaning"],
  ["laundry", "cleaning"], ["bleach", "cleaning"], ["sponge", "cleaning"], ["bin bag", "cleaning"],
  ["bin liner", "cleaning"], ["foil", "cleaning"], ["cling wrap", "cleaning"], ["glad wrap", "cleaning"],
  ["baking paper", "cleaning"], ["cleaner", "cleaning"], ["soap dish", "cleaning"],
  // personal care
  ["shampoo", "personal"], ["conditioner", "personal"], ["toothpaste", "personal"],
  ["toothbrush", "personal"], ["deodorant", "personal"], ["soap", "personal"],
  ["razor", "personal"], ["sunscreen", "personal"], ["moisturiser", "personal"],
  ["tampon", "personal"], ["pad", "personal"], ["band-aid", "personal"],
  // pantry (dry goods & staples — after the more specific ones)
  ["flour", "pantry"], ["mehl", "pantry"], ["sugar", "pantry"], ["zucker", "pantry"],
  ["rice", "pantry"], ["reis", "pantry"], ["pasta", "pantry"], ["nudel", "pantry"],
  ["spaghetti", "pantry"], ["noodle", "pantry"], ["oil", "pantry"], ["öl", "pantry"],
  ["vinegar", "pantry"], ["essig", "pantry"], ["salt", "pantry"], ["salz", "pantry"],
  ["pepper", "pantry"], ["pfeffer", "pantry"], ["spice", "pantry"], ["gewürz", "pantry"],
  ["stock", "pantry"], ["broth", "pantry"], ["tin", "pantry"], ["can of", "pantry"],
  ["canned", "pantry"], ["tomato paste", "pantry"], ["passata", "pantry"], ["sauce", "pantry"],
  ["mustard", "pantry"], ["senf", "pantry"], ["ketchup", "pantry"], ["mayo", "pantry"],
  ["honey", "pantry"], ["jam", "pantry"], ["marmelade", "pantry"], ["nutella", "pantry"],
  ["cereal", "pantry"], ["muesli", "pantry"], ["oats", "pantry"], ["coffee", "pantry"],
  ["tea", "pantry"], ["cocoa", "pantry"], ["baking powder", "pantry"], ["backpulver", "pantry"],
  ["vanilla", "pantry"], ["yeast", "pantry"], ["hefe", "pantry"], ["lentil", "pantry"],
  ["chickpea", "pantry"], ["couscous", "pantry"], ["soy sauce", "pantry"], ["curry paste", "pantry"],
  ["gherkin", "pantry"], ["gurken glas", "pantry"], ["sauerkraut", "pantry"],
];

// word-start boundary so "ham" never matches inside "shampoo"; longest keyword
// wins so "tomato paste" (pantry) beats "tomato" (produce)
const MATCHERS: [RegExp, string][] = [...KEYWORDS]
  .sort((a, b) => b[0].length - a[0].length)
  .map(([kw, cat]) => [new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`), cat]);

/** Best-effort category guess from an item name. Never wrong enough to matter —
 * a quiet per-item select on the list corrects it. */
export function guessCategory(name: string): string {
  const n = name.toLowerCase().trim();
  for (const [re, cat] of MATCHERS) {
    if (re.test(n)) return cat;
  }
  return "other";
}
