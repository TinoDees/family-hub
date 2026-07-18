# Nestly — product brief & user manual

*A living document. Every session that changes user-facing behaviour updates the matching
section here (see CLAUDE.md). Written so it can later become the in-app help / user manual.*

*Last updated: 18 Jul 2026.*

---

## What Nestly is

Nestly is a family hub: one private app for a household's money, meals, plans, photos,
messages and documents. One person creates the household and invites the others; every
member gets their own login, and per-module permissions decide who sees and edits what
(children can be limited or locked out of modules entirely). It runs as a web app and
installs to phones as a PWA.

Modules today: **Dashboard · Finance · Documents · Recipes & Meals · Meal planner ·
Shopping lists · Photos · Messages/Chat · Holidays & Trips · Parental controls ·
Settings/Members**. Navigation is customisable per household (Settings → the nav builder).

---

## Finance — the money module

### Accounts

One Nestly account per real bank account / card (Finance setup → Accounts). Accounts hold
transactions from three sources: a live bank feed, CSV import, and manual entry. An account
can show a **live balance** (with "synced X min ago") when connected to the feed; otherwise
the balance is opening balance + transactions.

**Split finances (for families without a joint account):** an account can belong to one
member and be marked **private** — then only its owner can see it or its transactions,
enforced at the database level. Every transaction is either **household** (counts in family
budgets and stats) or **personal** (the member's own — still in their balance, excluded
from family reporting). Use the 👤/🏠 buttons on a row to flip; Nestly remembers the choice
per merchant for future imports.

### The sorting workflow (To sort → Sorted)

Every account page has three tabs:

- **To sort** — the inbox. Transactions that need a person's eye: either no category yet,
  or a category **auto-filled by a rule** (marked 🪄) that's waiting for its confirmation
  tick. The moment you deal with a row it leaves this list. When the inbox is empty you
  get the 🎉 "All sorted!" screen.
- **✓ Sorted** — the reconciled history for the month: everything a person has confirmed,
  plus transfers. This is the family-friendly name for what accountants call reconciled.
- **All** — everything in the month, each row wearing a status pill (To sort / 🪄 To
  confirm / ✓ Sorted).

Ways a transaction gets sorted:

1. **You pick a category** in the grid (type-ahead box) — that counts as confirmed
   immediately, no extra tick.
2. **A rule fills it in** (see below) — the row shows *🪄 auto-filled* with ✓ (looks
   right — confirm) and ✕ (not right — clear it and pick another). One click each, or
   **🪄 Confirm all N** in the toolbar to confirm every auto-filled row at once.
3. **AI suggests** (✨ Suggest categories button) — suggestions appear in violet with
   accept ✓ / dismiss ✕ pills; accepting counts as confirmed.
4. **It's a transfer** between your own accounts (🔁, or the *Find transfers* scanner) —
   transfers are neither spending nor income and count as dealt with.

### Auto-rules (how Nestly learns)

Three layers, strongest first:

1. **📖 The rule book** (Finance → Rule book) — your written rules, Xero-style: *when the
   description (or merchant) contains X, allocate category Y*. Add rules in the rule book
   grid, or hit the **📖 button on any transaction** to start a rule pre-filled from it.
   When you save a rule it immediately *suggests* its category on every matching unsorted
   transaction (accept with ✓), and every future arrival matching it comes in
   pre-allocated as 🪄 to-confirm. Rules can look at the description, the merchant, or
   both; they can be paused (On/Off) and edited inline. An explicit rule always beats the
   automatic learning below.
2. **Payee memory** — Nestly builds one payee per merchant. When you categorise a
   merchant's transaction, the payee remembers it; future arrivals from that merchant
   come in pre-categorised as 🪄 to-confirm. The same memory applies your
   household/personal choice.
3. **The bank's own label** — used as a last resort when it matches one of your
   category names.

Nothing auto-allocated is ever silently final — it always lands as 🪄 to-confirm (or as a
✨/rule suggestion), so a person keeps the last word. First month is real sorting; after
that it's mostly ticks.

### Categories, sub-categories & budgets

Finance setup → Categories & budgets is a smart-sheet grid: search, Kind and Budget
filters, click-to-sort (Ctrl+click for multi-sort), resizable/reorderable columns, CSV
export. Edit inline (click a name, emoji or kind), or hit ✎ for the full edit modal.
Emojis come from a searchable library (or paste any emoji — Win + . opens the system
picker).

**Sub-categories:** drag a category's ⠿ grip onto another to nest it one level deep
(e.g. Groceries → Butcher). Drag onto the dashed drop zone (or use the modal's
"Sub-category of" selector) to make it top-level again. Nesting matches the child's kind
(expense/income) to the parent automatically. Sub-categories show indented (↳) under
their parent in the sheet.

**Monthly budgets** are set per expense category right in the grid (type an amount in the
row). They power the Finance overview's budget bars and the monthly review.

### Everything else in Finance

- **Import** — CSV from your bank; duplicates are detected and skipped, and known
  merchants come in pre-categorised (to-confirm).
- **Monthly review** — an AI write-up of the month: what went well, what to look at, and
  potential savings. Generated on demand per month.
- **Goals** — savings goals shown on the overview.
- **Deletion safety** — only the household owner deletes accounts; members request
  deletion and the owner gets a push notification.

---

## Other modules (summaries — expand as they change)

- **Documents** — the family filing cabinet: scans/photos of important documents with
  types, expiry dates and quick capture via the doc scanner.
- **Recipes & Meals** — recipe collection (from URLs, photos, even videos), cook mode,
  scaling, and a meal planner that feeds the shopping list.
- **Shopping lists** — shared lists, connected to the meal planner.
- **Photos** — family albums with per-photo visibility, sections and a chat under each.
- **Messages** — family chat rooms and DMs with push notifications.
- **Holidays & Trips** — trip planning with shared expenses, split/settlement maths,
  guest access for non-members and multi-currency support.
- **Parental** — per-child module permissions, PIN locks, device idle-lock.
- **Settings** — members & invites, roles, per-module permission matrix, navigation
  builder, household vocabulary.

---

## Ideas on the runway

- **Shared-living mode** (share houses: per-tenant contribution rules, house pot,
  settle-up) — see `docs/shared-costs-concept.md`.
- Category roll-up reporting (parent totals that include their sub-categories).
- Rule book v2: amount conditions ("contains X AND amount is exactly $30"), scope
  (household/personal) as a rule outcome, per-rule hit counts.
- Save-money vision — see `docs/save-money-vision.md`.
