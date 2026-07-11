# Family Hub

A household OS for families. Next.js 15 (App Router) · Supabase · Vercel.

## Run locally

```
npm install
npm run dev
```

`.env.local` is already wired to the `family-hub` Supabase project
(dcwciofraqmzqfwttdci, Sydney). Add `SUPABASE_SERVICE_ROLE_KEY` from the
Supabase dashboard (Settings → API) when admin operations are needed.

## What's built (Step 1)

- Email + password auth (signup / login / signout) via `@supabase/ssr`
- Session refresh middleware (`src/middleware.ts`)
- Onboarding: create a household (you become **owner**) or join via invite code (**adult**)
- Nav shell: sidebar + dashboard, driven by the module registry in `src/lib/modules.ts`
- Placeholder pages for all 9 modules via one dynamic route `src/app/(app)/[module]/page.tsx`
- Role-aware nav: `child` members don't see Finance or Parental Controls

## Database

`supabase/migrations/000_foundation.sql` (already applied to the project):
`households`, `household_members`, RLS with a security-definer membership
helper, and RPCs `create_household` / `join_household_by_code`.

The full 23-table schema supersedes this — since there's no data yet, if it
conflicts, reset the public schema and run the full schema (keep the two RPCs
or their equivalents; the onboarding flow calls them).

## Module registry (no hardcoding)

Add/rename modules in `src/lib/modules.ts` only — nav, dashboard grid and
placeholder pages all render from it.

## Build order

Foundation & auth ✅ → Finance → Recipes + Meal Planner → Shopping →
Holidays + Photos → Parental Controls + Chores → Voice.
