# Shared-living mode — tenant contributions to household costs (concept)

*Drafted 18 Jul 2026. Status: idea, not scheduled. Builds directly on split finances
(migration 047), whose comments already reserve "Phase 2: contributions + household pot".*

## The scenario

A share house / flat: 3–5 unrelated adults, each with fully private finances, who share a
defined set of costs — rent, electricity, internet, maybe a groceries pot. Unlike a family,
the *household* layer is the exception, not the default. Each tenant should be able to
**pre-set their contribution under their own tenant environment**, and the house should be
able to see at a glance who has paid what and who owes whom.

## Why Nestly is already 80% of the way there

- **Membership & permissions** — households, members, per-module access all exist.
- **Split finances (047)** — private accounts (`visibility = 'private'`, RLS-enforced) and
  per-transaction `scope` (household vs personal) are exactly the tenant model: everything
  personal by default, household-scoped spends are the shared ones. The migration's own
  design note: *"personal account + household-scoped spend is a contribution candidate."*
- **Settlement engine** — `src/lib/settlement.ts` + the expense-split modal already compute
  who-owes-whom for trips. The same maths applies to a share house month.
- **Payee learning** — `default_scope` on payees means the electricity provider lands as
  household automatically after the first classification.

## What's genuinely new

1. **Contribution rules** (the "pre-set" bit) — a small table:

   ```
   contribution_rules (
     id, household_id, user_id,
     method      'equal_share' | 'percent' | 'fixed_amount',
     value       numeric,            -- percent or $/period; null for equal_share
     category_id uuid null,          -- null = all household costs; set = just Rent, etc.
     period      'week' | 'fortnight' | 'month',
     created_at
   )
   ```

   Equal split of everything is one row per tenant; "Anna pays 40% of rent but rent only"
   is one row with a category. Rules are agreed once, then the maths runs itself.

2. **The house pot screen** — per period: expected contribution per tenant (from rules) vs
   actually paid (household-scoped transactions from that tenant's accounts) vs consumed
   (their share of household costs). Ends in a who-owes-whom list via the settlement engine,
   with a "mark settled" action (a transfer-style transaction between members).

3. **Tenant environment** — each member's own corner (extends /account): my contribution
   rules, my running balance with the house, my payment method note (e.g. "pays the rent
   directly, gets credited"). Tenants only ever see the *shared* layer of others — private
   accounts stay invisible exactly as 047 built it.

4. **Household type / vocabulary** — a `household_type` (family | share_house) driving
   labels ("family" → "house", "member" → "tenant") and defaults (new accounts default
   private, new transactions default personal — the inverse of the family default). This
   mirrors Tracey's tenant-vocabulary principle: data-driven, no hardcoding.

## Phasing (each shippable alone)

- **Phase A — rules + read-only pot.** Contribution rules CRUD (smart-sheet grid, of
  course) + the pot screen showing expected vs paid. No money movement, pure clarity.
- **Phase B — settle up.** Who-owes-whom + mark-settled transactions + push reminders
  ("rent share due Friday") via the existing web-push plumbing.
- **Phase C — share-house onboarding.** Household type at signup, tenant defaults,
  invite flow copy ("invite your flatmates"). This is the marketable feature: Nestly for
  share houses is a different product pitch than Nestly for families, same engine.

## Open questions for Tino

- Should a departing tenant's history stay (audit) or be exportable-then-archived?
- Rent paid directly to the landlord by one tenant vs into a joint account — model as a
  virtual "House" account, or as household-scoped spends with credits? (Leaning virtual
  account: it keeps the pot maths in one place.)
- Does the groceries pot need receipts-level fairness (per-item, like trip expense items)
  or is monthly lump-sum fine for v1? (Leaning lump-sum.)
