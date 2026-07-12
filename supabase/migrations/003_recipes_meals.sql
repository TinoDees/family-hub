-- Family Hub: 003_recipes_meals
-- Recipe library (structured ingredients — needed later for the
-- specials-matching AI) and the Mon–Sun meal planner.

create type meal_slot as enum ('breakfast', 'lunch', 'dinner', 'snack');

-- Generic module access resolver: per-member override wins, else the role
-- default passed in by the calling policy (mirrors src/lib/modules.ts).
create or replace function module_access(
  hid uuid,
  slug text,
  adult_default text,
  child_default text
)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select access::text from module_permissions
      where household_id = hid and user_id = auth.uid() and module_slug = slug),
    case (select role from household_members
           where household_id = hid and user_id = auth.uid())
      when 'owner' then 'edit'
      when 'adult' then adult_default
      when 'child' then child_default
      else 'none'
    end
  );
$$;

create table recipes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  name text not null,
  description text,
  servings int not null default 4,
  prep_minutes int,
  cook_minutes int,
  instructions text,
  tags text[] not null default '{}',
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references recipes (id) on delete cascade,
  household_id uuid not null references households (id) on delete cascade,
  position int not null default 0,
  name text not null,
  qty numeric(10, 3),
  unit text,
  note text
);

create index recipe_ingredients_recipe on recipe_ingredients (recipe_id, position);

create table meal_plan_entries (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  entry_date date not null,
  slot meal_slot not null default 'dinner',
  recipe_id uuid references recipes (id) on delete cascade,
  custom_text text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  check (recipe_id is not null or custom_text is not null)
);

create index meal_plan_entries_household_date
  on meal_plan_entries (household_id, entry_date);

alter table recipes enable row level security;
alter table recipe_ingredients enable row level security;
alter table meal_plan_entries enable row level security;

-- recipes module: adult edit, child view
create policy "recipes view" on recipes for select
  using (module_access(household_id, 'recipes', 'edit', 'view') in ('view','edit'));
create policy "recipes ins" on recipes for insert
  with check (module_access(household_id, 'recipes', 'edit', 'view') = 'edit');
create policy "recipes upd" on recipes for update
  using (module_access(household_id, 'recipes', 'edit', 'view') = 'edit');
create policy "recipes del" on recipes for delete
  using (module_access(household_id, 'recipes', 'edit', 'view') = 'edit');

create policy "ingredients view" on recipe_ingredients for select
  using (module_access(household_id, 'recipes', 'edit', 'view') in ('view','edit'));
create policy "ingredients ins" on recipe_ingredients for insert
  with check (module_access(household_id, 'recipes', 'edit', 'view') = 'edit');
create policy "ingredients upd" on recipe_ingredients for update
  using (module_access(household_id, 'recipes', 'edit', 'view') = 'edit');
create policy "ingredients del" on recipe_ingredients for delete
  using (module_access(household_id, 'recipes', 'edit', 'view') = 'edit');

-- meals module: adult edit, child view
create policy "meals view" on meal_plan_entries for select
  using (module_access(household_id, 'meals', 'edit', 'view') in ('view','edit'));
create policy "meals ins" on meal_plan_entries for insert
  with check (module_access(household_id, 'meals', 'edit', 'view') = 'edit');
create policy "meals upd" on meal_plan_entries for update
  using (module_access(household_id, 'meals', 'edit', 'view') = 'edit');
create policy "meals del" on meal_plan_entries for delete
  using (module_access(household_id, 'meals', 'edit', 'view') = 'edit');
