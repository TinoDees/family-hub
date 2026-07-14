# Nestly pays for itself — the anti-subscription strategy

*Born 14 Jul 2026 from David's first reaction: "Ahh… another subscription."*

## The insight

Every family-app pitch fails the same way: it asks for $10/month to add chores to a
calendar. Nestly flips it: **the product's job is to find and save the family more money
than it costs — and prove it.** The pitch is not "get organised", it's "stop leaking money".

The proof is a number on the dashboard: **"Nestly has saved your family $412 this year."**
That number is the retention engine, the referral line, and the answer to David.

## The pillars (ordered by leverage on existing code)

1. **Subscription hunter** — we already import bank transactions. Detect recurring charges
   (same merchant, same-ish amount, monthly/annual cadence), list every subscription with
   its yearly cost, flag price rises, and ask "still using this?". One cancelled streaming
   service pays for Nestly for a year. *Builds on: finance imports, dedupe hashes.*

2. **Bills & contracts registry** — insurances (car, home, health, life), utilities,
   internet/mobile plans, rego, rent/mortgage. Each with renewal date, cost, and provider.
   Push notification 3–4 weeks before renewal: "Car insurance renews 12 Aug — last year it
   jumped 18%. Time to compare." Links to the free government comparators (Energy Made
   Easy, etc.) — no affiliate games needed to be useful. *Builds on: planner events, push.*

3. **Warranty vault** — we already read receipts with AI. Scan any receipt → item, price,
   store, purchase date, warranty length → alert before warranty expires ("the dishwasher
   is still covered — claim, don't buy"). *Builds on: receipt scanning pipeline.*

4. **Savings goals + the "savings found" ledger** — every win is recorded (cancelled sub,
   cheaper insurer, warranty claim, specials-based meal plan) and rolls up into the
   headline number. *Builds on: finance stage 3 plans.*

5. **Grocery savings** — supermarket specials matched to the family's own recipes and the
   week's meal plan ("this week's plan costs $23 less at Woolworths"). *Already researched;
   needs the specials scrape + matching.*

6. **Mortgage & loans watch** — stage-4 loan cards get a rate-review nudge: "your fixed
   term ends in 90 days" / "you're 0.6% above the current average — a refinance saves
   ~$2,100/yr." *Builds on: finance stage 4 plans.*

## Monetisation stance

Free while it proves itself. When it charges, the price anchors against the savings number
("$5/mo, saved you $34/mo on average"). Never sell the family's data; never take affiliate
kickbacks that bias recommendations — trust is the product.

## Sequence proposal

Subscription hunter first (all ingredients exist, instant "wow"), then bills registry
(reuses planner + push), then warranty vault (reuses scanner), then the ledger to tie the
number together. Grocery savings and loans follow with bank feeds.
