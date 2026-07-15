-- 033: household members can read their own household's module flags
-- (writes stay service-role only via the admin panel)
create policy "members read own module flags"
  on household_module_flags for select
  using (
    exists (
      select 1 from household_members
      where household_id = household_module_flags.household_id
        and user_id = auth.uid()
    )
  );
