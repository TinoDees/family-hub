-- 059: marketing loop. Campaigns, signup attribution, household plans.
-- Campaigns + attributions are service-role only (RLS on, no policies),
-- written from server actions and read on /admin/marketing.

create table public.marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  channel text,                       -- meta | tiktok | google | organic | other
  utm_source text not null,           -- matches utm_source in links
  utm_medium text,
  utm_campaign text not null,         -- matches utm_campaign in links
  monthly_budget numeric,             -- AUD, informational
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (utm_source, utm_campaign)
);
alter table public.marketing_campaigns enable row level security;

-- First-touch attribution captured at signup from the nestly_attrib cookie.
create table public.signup_attributions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  referrer text,
  landing_path text,
  created_at timestamptz not null default now()
);
alter table public.signup_attributions enable row level security;

-- Plan per household. Foundation for free/premium tiers and the reverse trial:
-- a missing row means the household is still inside its trial window.
create table public.household_plans (
  household_id uuid primary key references public.households(id) on delete cascade,
  plan text not null default 'free',  -- free | premium
  trial_ends_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.household_plans enable row level security;

create policy "members read own household plan"
  on public.household_plans for select
  using (is_household_member(household_id));
