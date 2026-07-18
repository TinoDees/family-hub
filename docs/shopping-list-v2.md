# Shopping v2 — staples, the review step, categories/aisles & specials

*Feature spec, 19 Jul 2026. Tino's design, shaped by the same rule that governs the meal
planner (see `docs/meal-planning-v2.md`): every layer optional, useful at zero effort.
The review step is a drive-through, not a toll gate.*

---

## The idea

Shopping today is: meal planner → one generated list (+ manual adds). What's missing is
everything a real household actually manages around it:

1. **Staples** — groceries every household needs regardless of recipes (toilet paper,
   milk, coffee). A managed pantry list, with *optional* min/max per item.
2. **A review step** between planner and list — a purchasing worksheet: needed / SOH /
   min-max / suggested / to-buy, auto-filled, everything overridable.
3. **Categories & aisles** — the list grouped for the store, eventually sorted in
   walking order per supermarket.
4. **Specials nearby** — match what we need against retailer catalogues in proximity to
   home (postcode in settings — added later, never at signup).

The Kati principle applies everywhere: someone who ignores staples, never counts stock
and skips the review gets exactly today's experience. Every rung is opt-in and pays for
itself.

**Flow rework (19 Jul 2026, agreed with Tino):** the Pantry is the **master item
catalog** (all ingredients + household items), not just an extras list. Shopping gets
its own hub — `/shopping` = Overview dashboard, with Lists and Pantry tabs (Plan joins
in S2). Categories are **household-owned**: seeded from the built-in set, fully editable
both levels (one sub-level, e.g. Meat → Beef), managed in the Pantry's ⚙️ panel — the
auto-guesser keeps working via `builtin_slug`. Households define **retailers**; each
pantry item can prefer one. The S2 planning table gets a retailer column (pre-filled
from the pantry, overridable) and **Create shopping list produces one list per retailer**
(PO-style: "Woolies — week of 20 Jul", "Butcher — …", plus an "Anywhere" list), each
completable independently. Mig 053 ships retailers, grocery_categories,
pantry.category_id/retailer_id and shopping_lists.retailer_id.

---

## S1 — Staples + categories + the grouped list *(built first)*

**Pantry (staples) — `/shopping/pantry`.** A simple managed list: name + category, with
optional min/max (and a unit) tucked behind progressive disclosure — empty by default,
nothing nags. Stored in `pantry_items` (mig 052; includes `soh`/`soh_updated_at` columns
now so S2 needs no schema change). Access follows the `shopping` module.

**Categories.** One built-in taxonomy (produce, bakery, meat & seafood, deli, dairy &
eggs, pantry, frozen, drinks, snacks, baby, pet, cleaning, personal care, other) living
in `src/lib/groceries.ts` — the single source, with a keyword guesser (`guessCategory`)
that auto-categorises anything typed or generated (a few German staples included:
Brot → bakery, Wurst → meat…). Wrong guess → a quiet per-item select on the list fixes
it. `shopping_list_items.category` (text, mig 052).

**The grouped list.** `/shopping/[id]` renders grouped under category headers in a
sensible default walk order (produce first, frozen late, cleaning last). Manual adds and
planner-generated items are categorised automatically. **🧺 Add staples** on an open
list pulls in every pantry item not already on it (delete what you don't need — S2's
review makes this smart).

## S2 — The review step (the purchasing worksheet)

Meal planner's **🛒 Create shopping list** starts routing through `/shopping/review`
(same query: week window):

| Column | Fill |
|---|---|
| Item / category | union of recipe ingredients (scaled, aggregated — existing logic) + staples |
| Needed | from recipes; blank for pure staples |
| SOH | last known `pantry_items.soh` (blank until someone ever counts; editing here updates the pantry — stock knowledge decays in, no stocktake demanded) |
| Min / Max | from pantry, where set |
| **Suggested** | `max(needed − soh, 0)`; for staples with min/max: top-up-to-max when soh < min, else 0; no soh → suggested = needed |
| **To buy** | pre-filled = suggested; overwrite freely; 0/blank drops the row |

One primary button: **Create list**. Untouched table → identical outcome to today.
A skip preference ("don't show the review") keeps Kati's one-tap flow honest.

## S3 — Stores & aisle order

`stores` (per household: "Woolies Bowral") + per-store aisle mapping, category-level
first ("aisle 4 = pantry"), item-level override where it matters. Open a list, pick a
store → groups sort in aisle walking order. Pure opt-in config; no store selected →
default walk order from S1.

## S4 — Specials nearby *(research spike first)*

`households.postcode` (Settings → household, never signup). Engine: match S2's "to buy"
items against current specials at retailers within reach of the postcode. **Blocker to
resolve before committing:** AU catalogue data access (Coles/Woolworths/Aldi have no
clean public APIs — evaluate third-party catalogue feeds vs weekly scrape vs manual
per-retailer adapters). First concrete use case of `docs/save-money-vision.md`; the
existing AI plumbing (classify/review actions) is the natural home for fuzzy
item-to-special matching.

---

## Data (migration 052 — ships with S1)

```
pantry_items        (id, household_id, name, category, unit,
                     min_qty, max_qty, soh, soh_updated_at,   -- all optional
                     position, created_by, created_at)
shopping_list_items + category text
-- S3 later: stores, store_aisles;  S4 later: households.postcode
```

RLS: household-scoped via `module_access('shopping', …)`, mirroring shopping tables.

## Build order & status

| # | Chunk | Status |
|---|---|---|
| S1 | Staples page, taxonomy + guesser, grouped list, Add staples | **built 19 Jul 2026** |
| S1.5 | Shopping hub: household cats/subcats, retailers, pantry master catalog, dashboard tabs (migs 052+053 applied) | **built 19 Jul 2026** |
| S2 | Planning worksheet `/shopping/plan`: seeded from week recipes + below-min staples; SOH write-back; one list per retailer | **built 19 Jul 2026** |
| S3 | Stores & aisle ordering | next |
| S4 | Specials spike → engine | needs data-source research |

S2 notes: the meals page's 🛒 button now routes to `/shopping/plan?from=…&to=…` (the
worksheet is the drive-through — untouched + Create = one simple list). Recipe rows
match pantry items by case-insensitive name to prefill SOH/min-max/retailer; SOH edited
in the worksheet writes back to `pantry_items.soh` on Create. A per-user "skip the
worksheet" preference is still open (small; add if Kati finds even one click too many).

Meal-planner chunks still open (library dashboard, views, voting) queue behind S2 —
shopping is the reward end of the ladder, voting can wait.
