create table public.planning_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  excluded_foods text[] not null default '{}',
  excluded_exercises uuid[] not null default '{}',
  updated_at timestamptz not null default now(),
  check (coalesce(array_length(excluded_foods, 1), 0) <= 50),
  check (coalesce(array_length(excluded_exercises, 1), 0) <= 200),
  check (octet_length(array_to_string(excluded_foods, ',')) <= 4096)
);

alter table public.planning_preferences enable row level security;
create policy "Users manage own planning preferences" on public.planning_preferences
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.planning_preferences to authenticated;
