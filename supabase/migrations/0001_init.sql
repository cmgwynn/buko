-- Buko Phase 1 schema. Run in the Supabase SQL editor (or `supabase db push`).
-- Every table has row-level security: users can only touch rows where user_id = their own auth.uid().

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  goal text not null check (goal in ('lose', 'maintain', 'gain')),
  sex text not null check (sex in ('male', 'female', 'unspecified')),
  birth_year int not null check (birth_year between 1900 and 2100),
  height_cm numeric not null check (height_cm between 50 and 260),
  weight_kg numeric not null check (weight_kg between 20 and 500),
  activity_level text not null check (activity_level in ('sedentary', 'light', 'moderate', 'active', 'very_active')),
  diet_prefs text[] not null default '{}',
  units text not null default 'metric' check (units in ('metric', 'imperial')),
  onboarded_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.nutrition_targets (
  user_id uuid primary key references auth.users (id) on delete cascade,
  calories int not null check (calories > 0),
  protein_g int not null check (protein_g >= 0),
  carbs_g int not null check (carbs_g >= 0),
  fat_g int not null check (fat_g >= 0),
  bmr int not null,
  tdee int not null,
  -- true when the safety floor (1,200 kcal women / 1,500 men) raised the calculated target; the app shows a warning.
  floor_applied boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.food_log_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  logged_on date not null,
  meal text not null check (meal in ('breakfast', 'lunch', 'dinner', 'snack')),
  source text not null check (source in ('off', 'usda', 'manual')),
  source_id text,
  name text not null,
  brand text,
  quantity numeric not null check (quantity > 0),
  unit text not null,
  grams numeric not null check (grams > 0),
  -- Nutrition snapshot for the logged amount, so history never changes if upstream data does.
  calories numeric not null default 0,
  protein_g numeric not null default 0,
  carbs_g numeric not null default 0,
  fat_g numeric not null default 0,
  created_at timestamptz not null default now()
);
create index food_log_entries_user_day_idx on public.food_log_entries (user_id, logged_on);
create index food_log_entries_user_recent_idx on public.food_log_entries (user_id, created_at desc);

create table public.grocery_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  barcode text,
  source text not null default 'manual' check (source in ('off', 'usda', 'manual')),
  source_id text,
  quantity text,
  checked boolean not null default false,
  checked_at timestamptz,
  created_at timestamptz not null default now()
);
create index grocery_items_user_idx on public.grocery_items (user_id, checked, created_at desc);

-- Row-level security ------------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.nutrition_targets enable row level security;
alter table public.food_log_entries enable row level security;
alter table public.grocery_items enable row level security;

do $$
declare
  t text;
  op text;
begin
  foreach t in array array['profiles', 'nutrition_targets', 'food_log_entries', 'grocery_items'] loop
    foreach op in array array['select', 'insert', 'update', 'delete'] loop
      if op = 'insert' then
        execute format(
          'create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)',
          t || '_' || op || '_own', t);
      elsif op = 'update' then
        execute format(
          'create policy %I on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',
          t || '_' || op || '_own', t);
      else
        execute format(
          'create policy %I on public.%I for %s to authenticated using ((select auth.uid()) = user_id)',
          t || '_' || op || '_own', t, op);
      end if;
    end loop;
  end loop;
end $$;
