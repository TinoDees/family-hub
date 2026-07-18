# Nestly (family-hub)

Family-hub app ("Nestly", nestlyapp.co) built by Tino with Claude. One household = one
family; modules for finance, meals, photos, messages, docs, trips. Production on Vercel.

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind (stone palette, teal accents) ·
Supabase (Postgres + Auth + Storage + RLS) · Vercel.

**Supabase project:** `family-hub` — id `dcwciofraqmzqfwttdci` (NOT tracey; that's the
butchery app). Migrations live in `supabase/migrations/NNN_name.sql`, numbered
sequentially; apply via the Supabase MCP `apply_migration` with this project id.

## Orient yourself

1. `docs/product-brief.md` — what the app does, in user-manual form.
2. `docs/active` ideas: `shared-costs-concept.md`, `save-money-vision.md`, `launch-checklist.md`.
3. `git log --oneline -15`.

## Standing conventions (Tino's rules)

- **Keep `docs/product-brief.md` current.** Any change to user-facing behaviour updates
  the matching section in the same session — it doubles as the future in-app manual.
- **Every table/grid uses the smart-sheet kit** (see the `/smart-sheet` skill): search +
  all filter options in the toolbar, click-sort + Ctrl+click multi-sort with priority
  badges, drag-resize/reorder persisted columns, CSV, totals footer, mobile card
  fallback. Reference implementations: `src/components/transactions-grid.tsx` and
  `src/components/categories-grid.tsx`.
- **Mutations from grids are inline server actions** (`*Inline` in `src/lib/actions/*`)
  returning `{ ok, error? }`, applied optimistically with rollback — not form+redirect.
  Form+redirect (with `?sec=` banners) is fine for plain page forms.
- **Emoji pickers** use `src/components/emoji-picker.tsx` + `src/lib/emoji-library.ts`.
- **Finance sorting model (mig 050):** `finance_transactions.reviewed` = a person
  confirmed the category. Rule-applied categories (payee memory / bank match) stay
  `reviewed=false` ("🪄 to confirm") until ticked. Manual picks and accepted suggestions
  set `reviewed=true` at write time. The account "To sort" inbox = not transfer AND
  (no category OR unreviewed).
- **Sub-categories (mig 050):** `finance_categories.parent_id`, one level deep only;
  nesting aligns the child's kind with the parent's (`setCategoryParentInline`).
- **Never expose one household's data to another** — every query filters
  `household_id`, RLS backs it up. Private accounts (mig 047) must stay invisible to
  non-owners.
- **Hand-over:** after each chunk of work give Tino the exact PowerShell commit+push
  (targeted `git add` of changed files only, never `-A`) plus a short what-to-test
  checklist (page → action → expected, incl. permission and mobile cases).
- The repo path has no parentheses — normal Edit/Write tooling is safe here (unlike the
  Tracey repo).
