# Meal planning v2 — the self-building recipe book, views & family voting

*Feature spec, 18 Jul 2026. Discussed with Kati (design partner #1). Nothing here is built
yet; this doc is the agreed direction. Companion to `docs/product-brief.md` → "Recipes &
Meals".*

---

## The problem (Kati's feedback, verbatim in spirit)

> "I don't want to set up all the recipes first before I can have an automated menu
> planner. What if I just want to set a menu for the week and decide myself what I shop
> for?"

She's right. The current flow assumes recipes exist *before* planning is useful. The fix
is not to lower the reward — it's to make the zero-setup tier genuinely useful and let the
recipe library **build itself as a byproduct of planning dinner**, in ten-second
increments, never as an upfront project.

**The effort ladder** (every rung is a complete, useful product; nobody is pushed up):

1. **Type a menu** — plain text per day. Useful on day one. She shops from her head.
2. **The app remembers** — everything she types becomes a name-only recipe; next week it
   autocompletes.
3. **Brain-dump ingredients** — optional, per meal, at the moment she's already thinking
   about that meal. Unlocks the auto shopping list *for that meal only*.
4. **Full recipes** (method, photos, servings) — only for people who care. All the
   existing import magic (URL / photo scan / video) stays as accelerators.

---

## What already exists (audit, 18 Jul 2026)

Better than expected — most of the data model is already right:

| Piece | State |
|---|---|
| `meal_plan_entries` (mig 003) | date + slot + `recipe_id` **or** `custom_text` — free text already supported; multiple entries per day/slot cell already work (so "multi-select" is just N rows). `servings` per entry (mig 014). |
| `recipes` + `recipe_ingredients` (mig 003) | Solid. `qty`/`unit` already nullable → name-only ingredients are legal today. |
| Recipe import | URL (`recipe-from-url.ts`), photo scan, video, share-in from phone — all shipped. These become the **enrichment accelerators**, no new work. |
| Week ingredient aggregation → shopping list | `shoppingListFromWeek` works, scaled by servings. Only covers entries with a `recipe_id` + ingredients — correct behaviour for the ladder. |
| `/meals` UI | The weak spot: `<details>` + `<select>` + separate free-text input, form+redirect per add. This is what gets replaced. |
| `/planner` | Family events calendar (`planner_events`), week view, separate module. |
| Messaging | `chat_messages` (household / trip / dm), conversations, web push. |
| Share tokens (mig 048) | Public tokenised pages already exist (`/share-recipe`, guest trips) — the exact pattern voting links need. |

**Key insight:** free-typed meals currently vanish into `custom_text` and are never seen
again. That's the single biggest gap. Almost everything else is UI.

---

## Feature A — the meal combobox + quick-add modal (the heart of it)

### Combobox (replaces the current add-form in every planner cell)

Click a cell → an input with a dropdown, filtering the household's recipes as she types.

- **Multi-select:** she can pick several dishes for one slot ("Schnitzel" +
  "Kartoffelsalat"). Each becomes its own `meal_plan_entries` row (already supported).
  Chips show what's selected; ✕ removes one.
- Match is case-insensitive substring; exact-name match is highlighted first (soft
  dedupe: typing "spag bol" surfaces "Spaghetti Bolognese" before offering to create a
  twin).
- Last dropdown row is always **`+ Create "Rouladen"`** → opens the quick-add modal.
- Also offer **`Use "…" as one-off text`** for things that aren't recipes ("Leftovers",
  "Eating out", "At Oma's") → stays `custom_text`, deliberately *not* added to the
  library. Common one-offs (Leftovers, Takeaway, Eating out) appear as built-in
  suggestions so the library never fills with junk.

### Quick-add modal (the brain-dump)

Opens with the name pre-filled. **Only the name is required.**

- **Ingredients: one plain textarea, one ingredient per line.** No qty/unit grid, no
  dropdowns. `500g beef mince` parses loosely into qty/unit/name; `gherkins` is just a
  name. (Parser: optional leading number + known unit token; everything else = name.
  Lives in `src/lib/ingredients.ts`, shared with future imports — same "one place only"
  rule as `rules.ts`.)
- **Method: collapsed section**, ignorable forever.
- Save → creates the `recipes` row (+ any `recipe_ingredients`), links it into the meal
  slot, closes. Ten seconds, done. The existing full editor (`IngredientEditor`,
  qty/unit/note grid) remains the *edit* experience for people who want precision.
- The same modal is reachable from the recipe library ("+ Quick add") — two entrances,
  one component.

### Recipe status (derived, not stored)

No new column; derive per recipe: **name only** (no ingredients, no method) → **has
ingredients** → **complete** (ingredients + method). Shown as chips in the library and
usable as a filter. Never nagging — no red badges, no "finish your recipe!" prompts.

### Mechanics per house rules

- New client component `src/components/meal-cell-picker.tsx`; mutations become inline
  server actions (`addMealEntriesInline`, `removeMealEntryInline`,
  `quickCreateRecipeInline` in `src/lib/actions/meals.ts` / `recipes.ts`) returning
  `{ ok, error? }`, applied optimistically with rollback — replacing today's
  form+redirect in the grid.
- Migration needed: **none** for feature A (optionally `recipes.created_from text`
  — 'planner' | 'manual' | 'url' | 'scan' | 'video' — nice for the library dashboard;
  fold into mig 052 if we want it).
- Mobile: the combobox becomes a bottom-sheet on small screens (planner cells are tiny).

---

## Feature B — planner views: day / week / month (+ meals as a layer)

Direction agreed with Tino: **the meal plan becomes a layer on the family planner**
rather than growing its own parallel calendar, controlled with filters/toggles.

- `/meals` keeps its focused week grid (Kati's working view) and gains a **Day | Week |
  Month** segmented toggle. Day = today's meals big and touch-friendly (the
  kitchen-counter view). Month = compact overview, dinner names only ("we've had pasta
  four times").
- `/planner` gains layer toggles: **Events ✓ | Meals ✓** (per-layer on/off, persisted per
  user like nav prefs). Meal entries render as compact chips under the day's events;
  clicking one jumps to that day in `/meals`. Multi-month = the planner's month view
  paging forward, not a new meal view.
- No schema change; both read `meal_plan_entries` / `planner_events` as today.

---

## Feature C — the recipe library dashboard (enrich at leisure)

`/recipes` upgraded from a simple card list to the household cookbook with the ladder
visible:

- Status chips + filter (All / Name only / Has ingredients / Complete), search, tags.
- Each *name-only* card offers three enrichment paths inline: **✍️ add ingredients**
  (opens the same quick-add modal in edit mode), **🔗 paste a link** (existing URL
  import fills the recipe), **📷 scan** (existing photo scan). All three already exist as
  actions — this is wiring, not building.
- "Used N× this month" per recipe (count of `meal_plan_entries`) — surfaces the family's
  real repertoire, and later feeds vote options and the save-money specials-matching
  idea.
- Merge duplicates ("Spag Bol" → "Spaghetti Bolognese"): v2, not launch-blocking. The
  combobox's match-first behaviour prevents most twins up front.

---

## Feature D — family meal voting (native + WhatsApp share link, zero cost)

**Constraint honoured: no WhatsApp Business API** (verified business number,
per-message fees). WhatsApp is a *distribution channel* for a Nestly link, which costs
nothing.

### Flow

1. From a planner cell (or `/meals` toolbar): **"Start a vote"** → pick 2–5 options from
   the recipe library (or free text), set the target day/slot, optional closing time
   ("vote by 3pm or Mum decides").
2. The vote posts as a **poll card in the household chat** (native: options, live counts,
   one vote per member, tap to change until close). Push notification via existing web
   push.
3. **Share out:** a tokenised public vote page (same pattern as mig 048 / guest trips) +
   a pre-filled `https://wa.me/?text=…` share link / `navigator.share` sheet. Family
   taps the link in the WhatsApp group → lightweight vote page, no login (name picker for
   known members; token scoped to this vote only, expires at close).
4. On close: winner auto-fills the meal slot (as a normal entry — linked recipe if the
   option was one), result posts back into the chat ("🌮 Tacos won, 4–2").

### Data (migration 052)

```
meal_votes         (id, household_id, target_date, slot, status open|closed,
                    closes_at, created_by, winner_option_id, share_token)
meal_vote_options  (id, vote_id, household_id, recipe_id nullable, label, position)
meal_vote_ballots  (id, vote_id, household_id, option_id, voter_user_id nullable,
                    voter_name text,           -- for tokened guests (kids w/o login)
                    unique (vote_id, voter_user_id) where voter_user_id is not null)
```

RLS: household-scoped as always; the public page goes through a security-definer RPC
keyed by `share_token` (never direct table access), mirroring the guest-trip pattern.
Chat integration: the poll card is a `chat_messages` row with a `meal_vote_id` reference
(add nullable column or a `kind` field — decide at build time with the chat schema open).

---

## Build order

| # | Chunk | Size | Depends on |
|---|---|---|---|
| 1 | **A** — combobox multi-select + quick-add modal + loose ingredient parser + inline actions | the big one, ~1 session | — |
| 2 | **C** — library dashboard (status chips, filters, enrichment wiring, usage counts) | small–medium | A (status derivation, parser) |
| 3 | **B** — Day/Week/Month toggle on `/meals` + meals layer on `/planner` | medium | — (parallel-safe) |
| 4 | **D** — voting: mig 052, poll card in chat, public vote page, WhatsApp share, auto-fill winner | medium–large, own session | A helps (options from library) |

Each chunk ships with: `docs/product-brief.md` update (Recipes & Meals section),
PowerShell commit+push (targeted `git add`), and a what-to-test checklist — with Kati as
the tester for chunk 1 especially.

## Open questions (fine to defer)

- Voting: can kids without their own login vote *in-app* on a shared kitchen device, or
  only via the share link? (Affects nothing structural.)
- Month view density on mobile — dinner-only by default?
- `created_from` column: worth it for the dashboard, or derive "added from planner" by
  ingredient-less-ness alone?

## What deliberately does NOT change

- No forced recipe setup, ever. `custom_text` one-offs remain first-class.
- `shoppingListFromWeek` still only pulls entries whose recipe has ingredients — that's
  the ladder working as designed, not a bug. Manual quick-adds on the shopping list
  cover the rest.
- Existing URL/scan/video import, cook mode, scaler: untouched, repositioned as
  enrichment accelerators.
