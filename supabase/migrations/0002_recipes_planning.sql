-- Buko Phase 2 schema: recipes, meal planning, pantry, generated grocery lists.
-- Run in the Supabase SQL editor AFTER 0001_init.sql.
-- Every new table has row-level security. Child tables also verify that the parent recipe belongs to the caller,
-- so nobody can attach rows to someone else's recipe even by guessing its id.

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  servings numeric not null default 1 check (servings > 0 and servings <= 100),
  prep_minutes int check (prep_minutes >= 0),
  cook_minutes int check (cook_minutes >= 0),
  -- Set for imported recipes; always displayed with the recipe.
  source_url text,
  source_name text,
  -- Path inside the private "recipe-photos" bucket: <user id>/<recipe id>.jpg
  photo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index recipes_user_idx on public.recipes (user_id, created_at desc);

create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  position int not null,
  raw_text text not null,
  quantity numeric,
  unit text,
  name text not null,
  -- Estimated or entered weight of this ingredient in the recipe, used for nutrition.
  grams numeric check (grams >= 0),
  food_source text check (food_source in ('usda', 'off', 'manual')),
  food_source_id text,
  -- { per100g: {calories, protein, carbs, fat, sugars, saturatedFat, sodiumMg, fiber}, category }
  nutrition jsonb,
  section text not null default 'pantry' check (section in ('produce', 'dairy', 'meat', 'pantry', 'frozen', 'other')),
  match_status text not null default 'unmatched' check (match_status in ('matched', 'unmatched', 'manual'))
);
create index recipe_ingredients_recipe_idx on public.recipe_ingredients (recipe_id, position);

create table public.recipe_steps (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  position int not null,
  text text not null,
  timer_seconds int check (timer_seconds > 0)
);
create index recipe_steps_recipe_idx on public.recipe_steps (recipe_id, position);

create table public.meal_plan_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  planned_on date not null,
  meal text not null check (meal in ('breakfast', 'lunch', 'dinner', 'snack')),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  servings numeric not null default 1 check (servings > 0),
  -- Set when the meal was cooked and logged to the diary.
  logged_at timestamptz,
  created_at timestamptz not null default now()
);
create index meal_plan_entries_user_day_idx on public.meal_plan_entries (user_id, planned_on);

create table public.pantry_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  canonical_name text not null,
  -- Null quantity means "I have it" without tracking an amount.
  quantity numeric check (quantity >= 0),
  unit text,
  section text not null default 'pantry' check (section in ('produce', 'dairy', 'meat', 'pantry', 'frozen', 'other')),
  updated_at timestamptz not null default now(),
  unique (user_id, canonical_name)
);

-- Existing tables ----------------------------------------------------------------------------------
alter table public.grocery_items
  add column quantity_value numeric,
  add column unit text,
  add column section text not null default 'other' check (section in ('produce', 'dairy', 'meat', 'pantry', 'frozen', 'other')),
  -- Monday of the week this item was generated for; null for items added by hand or from scans.
  add column generated_week date,
  add column from_recipes text[] not null default '{}';

alter table public.grocery_items drop constraint grocery_items_source_check;
alter table public.grocery_items add constraint grocery_items_source_check check (source in ('off', 'usda', 'manual', 'plan'));

alter table public.food_log_entries drop constraint food_log_entries_source_check;
alter table public.food_log_entries add constraint food_log_entries_source_check check (source in ('off', 'usda', 'manual', 'recipe'));

-- Row-level security -------------------------------------------------------------------------------
alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.recipe_steps enable row level security;
alter table public.meal_plan_entries enable row level security;
alter table public.pantry_items enable row level security;

do $$
declare
  t text;
  op text;
  child boolean;
  owns text := 'exists (select 1 from public.recipes r where r.id = recipe_id and r.user_id = (select auth.uid()))';
begin
  foreach t in array array['recipes', 'recipe_ingredients', 'recipe_steps', 'meal_plan_entries', 'pantry_items'] loop
    child := t in ('recipe_ingredients', 'recipe_steps', 'meal_plan_entries');
    foreach op in array array['select', 'insert', 'update', 'delete'] loop
      if op = 'insert' then
        execute format(
          'create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = user_id%s)',
          t || '_insert_own', t, case when child then ' and ' || owns else '' end);
      elsif op = 'update' then
        execute format(
          'create policy %I on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id%s)',
          t || '_update_own', t, case when child then ' and ' || owns else '' end);
      else
        execute format(
          'create policy %I on public.%I for %s to authenticated using ((select auth.uid()) = user_id)',
          t || '_' || op || '_own', t, op);
      end if;
    end loop;
  end loop;
end $$;

-- Photo storage ------------------------------------------------------------------------------------
-- Private bucket; each user can only read and write files under a folder named with their own user id.
insert into storage.buckets (id, name, public) values ('recipe-photos', 'recipe-photos', false)
on conflict (id) do nothing;

create policy recipe_photos_select_own on storage.objects for select to authenticated
  using (bucket_id = 'recipe-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy recipe_photos_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'recipe-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy recipe_photos_update_own on storage.objects for update to authenticated
  using (bucket_id = 'recipe-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'recipe-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy recipe_photos_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'recipe-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
