-- Buko Phase 3 schema: exercise library, workouts, routines, body measurements, health data, settings.
-- Run in the Supabase SQL editor AFTER 0002_recipes_planning.sql, as a NEW query (do not paste under the old ones).
-- Every new table has row-level security. Child tables also verify that the parent row belongs to the caller.
-- Health data (steps, active calories, imported workouts) is stored only here, owned by the user, and is
-- never used for advertising or shared with third parties.

-- Exercise library ---------------------------------------------------------------------------------------
-- Rows with user_id NULL are built in and read-only for everyone. Custom exercises belong to one user.
create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  category text not null check (category in ('strength', 'cardio')),
  -- Primary muscle first. Vocabulary: chest, back, shoulders, biceps, triceps, forearms, abs, glutes,
  -- quads, hamstrings, calves, traps, full_body, cardio.
  muscle_groups text[] not null default '{}',
  equipment text,
  -- Metabolic equivalent (Compendium of Physical Activities), used to estimate calories when no device value exists.
  met numeric not null default 4.5 check (met between 1 and 25),
  created_at timestamptz not null default now()
);
create unique index exercises_builtin_name_idx on public.exercises (lower(name)) where user_id is null;
create unique index exercises_user_name_idx on public.exercises (user_id, lower(name)) where user_id is not null;

-- Routine templates -------------------------------------------------------------------------------------
create table public.routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index routines_user_idx on public.routines (user_id, updated_at desc);

create table public.routine_exercises (
  id uuid primary key default gen_random_uuid(),
  routine_id uuid not null references public.routines (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete restrict,
  position int not null,
  target_sets int check (target_sets between 1 and 50),
  target_reps int check (target_reps between 1 and 1000),
  target_weight_kg numeric check (target_weight_kg >= 0),
  -- Cardio targets
  target_duration_s int check (target_duration_s > 0),
  target_distance_m numeric check (target_distance_m > 0)
);
create index routine_exercises_routine_idx on public.routine_exercises (routine_id, position);

-- Workouts ----------------------------------------------------------------------------------------------
create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  started_at timestamptz not null default now(),
  duration_min numeric check (duration_min >= 0 and duration_min <= 1440),
  calories_burned numeric check (calories_burned >= 0 and calories_burned <= 20000),
  -- true when calories were estimated by Buko (MET x weight x time) rather than measured by a device.
  calories_estimated boolean not null default true,
  notes text,
  routine_id uuid references public.routines (id) on delete set null,
  source text not null default 'buko' check (source in ('buko', 'healthkit', 'health_connect')),
  -- Id of the workout in the health app it was imported from, so re-syncing never duplicates it.
  external_id text,
  -- Id of the sample Buko wrote to the health app for this workout, so edits/deletes can be mirrored.
  exported_external_id text,
  created_at timestamptz not null default now()
);
create index workouts_user_idx on public.workouts (user_id, started_at desc);
create unique index workouts_external_idx on public.workouts (user_id, source, external_id) where external_id is not null;

create table public.workout_exercises (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete restrict,
  position int not null,
  notes text
);
create index workout_exercises_workout_idx on public.workout_exercises (workout_id, position);
create index workout_exercises_exercise_idx on public.workout_exercises (user_id, exercise_id);

create table public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  workout_exercise_id uuid not null references public.workout_exercises (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  position int not null,
  reps int check (reps between 0 and 1000),
  weight_kg numeric check (weight_kg >= 0 and weight_kg <= 1500),
  is_warmup boolean not null default false,
  duration_s int check (duration_s >= 0),
  distance_m numeric check (distance_m >= 0)
);
create index workout_sets_we_idx on public.workout_sets (workout_exercise_id, position);

-- Body measurements -------------------------------------------------------------------------------------
create table public.body_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  measured_on date not null,
  kind text not null check (kind in ('weight', 'body_fat', 'waist', 'chest', 'hips', 'arm', 'thigh')),
  -- Always metric: kg for weight, % for body_fat, cm for the rest. The app converts for display.
  value numeric not null check (value > 0 and value < 1000),
  created_at timestamptz not null default now(),
  unique (user_id, measured_on, kind)
);
create index body_measurements_idx on public.body_measurements (user_id, kind, measured_on desc);

-- Daily activity (synced from HealthKit / Health Connect when the user turns that on) ----------------------
create table public.daily_activity (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  steps int check (steps >= 0),
  active_kcal numeric check (active_kcal >= 0),
  source text not null check (source in ('healthkit', 'health_connect')),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

-- Settings ----------------------------------------------------------------------------------------------
-- Each health toggle records the user's choice. The OS permission itself is requested on the phone only
-- at the moment the user switches that toggle on.
create table public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  activity_adjust boolean not null default false,
  -- Share of burned calories added to the daily target. Default 50% because burn estimates run high.
  activity_share numeric not null default 0.5 check (activity_share between 0 and 1),
  health_read_steps boolean not null default false,
  health_read_active_energy boolean not null default false,
  health_read_workouts boolean not null default false,
  health_write_workouts boolean not null default false,
  health_write_nutrition boolean not null default false,
  updated_at timestamptz not null default now()
);

-- Lets a diary entry written to the health app be removed from it when the entry is deleted.
alter table public.food_log_entries add column health_external_id text;

-- Row-level security ------------------------------------------------------------------------------------
alter table public.exercises enable row level security;
alter table public.routines enable row level security;
alter table public.routine_exercises enable row level security;
alter table public.workouts enable row level security;
alter table public.workout_exercises enable row level security;
alter table public.workout_sets enable row level security;
alter table public.body_measurements enable row level security;
alter table public.daily_activity enable row level security;
alter table public.user_settings enable row level security;

-- Exercises: everyone signed in can read built-ins and their own; only the owner can change custom ones.
create policy exercises_select on public.exercises for select to authenticated
  using (user_id is null or (select auth.uid()) = user_id);
create policy exercises_insert_own on public.exercises for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy exercises_update_own on public.exercises for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy exercises_delete_own on public.exercises for delete to authenticated
  using ((select auth.uid()) = user_id);

do $$
declare
  t text;
  op text;
  -- Extra condition per table: the parent row must belong to the caller (and any exercise must be visible to them).
  extra jsonb := jsonb_build_object(
    'routine_exercises',
      'exists (select 1 from public.routines p where p.id = routine_id and p.user_id = (select auth.uid()))'
      || ' and exists (select 1 from public.exercises e where e.id = exercise_id and (e.user_id is null or e.user_id = (select auth.uid())))',
    'workout_exercises',
      'exists (select 1 from public.workouts p where p.id = workout_id and p.user_id = (select auth.uid()))'
      || ' and exists (select 1 from public.exercises e where e.id = exercise_id and (e.user_id is null or e.user_id = (select auth.uid())))',
    'workout_sets',
      'exists (select 1 from public.workout_exercises p where p.id = workout_exercise_id and p.user_id = (select auth.uid()))'
  );
  cond text;
begin
  foreach t in array array['routines', 'routine_exercises', 'workouts', 'workout_exercises', 'workout_sets',
                           'body_measurements', 'daily_activity', 'user_settings'] loop
    cond := coalesce(' and ' || (extra ->> t), '');
    foreach op in array array['select', 'insert', 'update', 'delete'] loop
      if op = 'insert' then
        execute format('create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = user_id%s)',
          t || '_insert_own', t, cond);
      elsif op = 'update' then
        execute format('create policy %I on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id%s)',
          t || '_update_own', t, cond);
      else
        execute format('create policy %I on public.%I for %s to authenticated using ((select auth.uid()) = user_id)',
          t || '_' || op || '_own', t, op);
      end if;
    end loop;
  end loop;
end $$;

-- Built-in exercise library ---------------------------------------------------------------------------------
-- Names and muscle groups are written for Buko. MET values are approximate figures from the Compendium of
-- Physical Activities (Ainsworth et al.); they only drive calorie *estimates*, which the app labels as estimates.
insert into public.exercises (name, category, muscle_groups, equipment, met) values
  -- Chest
  ('Barbell Bench Press', 'strength', '{chest,triceps,shoulders}', 'barbell', 5.0),
  ('Incline Barbell Bench Press', 'strength', '{chest,shoulders,triceps}', 'barbell', 5.0),
  ('Dumbbell Bench Press', 'strength', '{chest,triceps,shoulders}', 'dumbbell', 5.0),
  ('Incline Dumbbell Press', 'strength', '{chest,shoulders,triceps}', 'dumbbell', 5.0),
  ('Push-Up', 'strength', '{chest,triceps,shoulders}', 'bodyweight', 3.8),
  ('Chest Dip', 'strength', '{chest,triceps,shoulders}', 'bodyweight', 5.0),
  ('Machine Chest Press', 'strength', '{chest,triceps,shoulders}', 'machine', 4.5),
  ('Cable Fly', 'strength', '{chest,shoulders}', 'cable', 4.0),
  ('Dumbbell Fly', 'strength', '{chest,shoulders}', 'dumbbell', 4.0),
  ('Pec Deck', 'strength', '{chest,shoulders}', 'machine', 4.0),
  -- Back
  ('Deadlift', 'strength', '{back,glutes,hamstrings,traps}', 'barbell', 6.0),
  ('Barbell Row', 'strength', '{back,biceps,traps}', 'barbell', 5.0),
  ('Dumbbell Row', 'strength', '{back,biceps}', 'dumbbell', 5.0),
  ('Pull-Up', 'strength', '{back,biceps,forearms}', 'bodyweight', 5.0),
  ('Chin-Up', 'strength', '{back,biceps}', 'bodyweight', 5.0),
  ('Lat Pulldown', 'strength', '{back,biceps}', 'cable', 4.5),
  ('Seated Cable Row', 'strength', '{back,biceps,traps}', 'cable', 4.5),
  ('T-Bar Row', 'strength', '{back,biceps,traps}', 'barbell', 5.0),
  ('Straight-Arm Pulldown', 'strength', '{back}', 'cable', 4.0),
  ('Back Extension', 'strength', '{back,glutes,hamstrings}', 'bodyweight', 4.0),
  ('Face Pull', 'strength', '{shoulders,traps,back}', 'cable', 4.0),
  -- Shoulders
  ('Overhead Press', 'strength', '{shoulders,triceps}', 'barbell', 5.0),
  ('Dumbbell Shoulder Press', 'strength', '{shoulders,triceps}', 'dumbbell', 5.0),
  ('Arnold Press', 'strength', '{shoulders,triceps}', 'dumbbell', 5.0),
  ('Lateral Raise', 'strength', '{shoulders}', 'dumbbell', 3.8),
  ('Front Raise', 'strength', '{shoulders}', 'dumbbell', 3.8),
  ('Rear Delt Fly', 'strength', '{shoulders,back}', 'dumbbell', 3.8),
  ('Upright Row', 'strength', '{shoulders,traps}', 'barbell', 4.5),
  ('Barbell Shrug', 'strength', '{traps}', 'barbell', 4.0),
  ('Dumbbell Shrug', 'strength', '{traps}', 'dumbbell', 4.0),
  -- Biceps
  ('Barbell Curl', 'strength', '{biceps,forearms}', 'barbell', 4.0),
  ('Dumbbell Curl', 'strength', '{biceps,forearms}', 'dumbbell', 4.0),
  ('Hammer Curl', 'strength', '{biceps,forearms}', 'dumbbell', 4.0),
  ('Preacher Curl', 'strength', '{biceps}', 'barbell', 4.0),
  ('Cable Curl', 'strength', '{biceps}', 'cable', 4.0),
  ('Incline Dumbbell Curl', 'strength', '{biceps}', 'dumbbell', 4.0),
  -- Triceps
  ('Triceps Pushdown', 'strength', '{triceps}', 'cable', 4.0),
  ('Skull Crusher', 'strength', '{triceps}', 'barbell', 4.5),
  ('Overhead Triceps Extension', 'strength', '{triceps}', 'dumbbell', 4.0),
  ('Close-Grip Bench Press', 'strength', '{triceps,chest,shoulders}', 'barbell', 5.0),
  ('Bench Dip', 'strength', '{triceps,shoulders}', 'bodyweight', 4.5),
  ('Diamond Push-Up', 'strength', '{triceps,chest}', 'bodyweight', 4.0),
  -- Legs
  ('Back Squat', 'strength', '{quads,glutes,hamstrings}', 'barbell', 6.0),
  ('Front Squat', 'strength', '{quads,glutes,abs}', 'barbell', 6.0),
  ('Goblet Squat', 'strength', '{quads,glutes}', 'dumbbell', 5.0),
  ('Leg Press', 'strength', '{quads,glutes,hamstrings}', 'machine', 5.0),
  ('Hack Squat', 'strength', '{quads,glutes}', 'machine', 5.0),
  ('Lunge', 'strength', '{quads,glutes,hamstrings}', 'dumbbell', 5.0),
  ('Walking Lunge', 'strength', '{quads,glutes,hamstrings}', 'dumbbell', 5.5),
  ('Bulgarian Split Squat', 'strength', '{quads,glutes}', 'dumbbell', 5.5),
  ('Step-Up', 'strength', '{quads,glutes}', 'dumbbell', 5.0),
  ('Leg Extension', 'strength', '{quads}', 'machine', 4.0),
  ('Romanian Deadlift', 'strength', '{hamstrings,glutes,back}', 'barbell', 5.5),
  ('Sumo Deadlift', 'strength', '{glutes,hamstrings,quads,back}', 'barbell', 6.0),
  ('Good Morning', 'strength', '{hamstrings,glutes,back}', 'barbell', 5.0),
  ('Lying Leg Curl', 'strength', '{hamstrings}', 'machine', 4.0),
  ('Seated Leg Curl', 'strength', '{hamstrings}', 'machine', 4.0),
  ('Hip Thrust', 'strength', '{glutes,hamstrings}', 'barbell', 5.0),
  ('Glute Bridge', 'strength', '{glutes,hamstrings}', 'bodyweight', 3.8),
  ('Cable Kickback', 'strength', '{glutes}', 'cable', 3.8),
  ('Standing Calf Raise', 'strength', '{calves}', 'machine', 3.8),
  ('Seated Calf Raise', 'strength', '{calves}', 'machine', 3.5),
  -- Core
  ('Plank', 'strength', '{abs}', 'bodyweight', 3.3),
  ('Side Plank', 'strength', '{abs}', 'bodyweight', 3.3),
  ('Crunch', 'strength', '{abs}', 'bodyweight', 3.8),
  ('Sit-Up', 'strength', '{abs}', 'bodyweight', 3.8),
  ('Hanging Leg Raise', 'strength', '{abs,forearms}', 'bodyweight', 4.0),
  ('Cable Crunch', 'strength', '{abs}', 'cable', 4.0),
  ('Russian Twist', 'strength', '{abs}', 'bodyweight', 3.8),
  ('Ab Wheel Rollout', 'strength', '{abs,shoulders}', 'other', 4.5),
  -- Full body
  ('Kettlebell Swing', 'strength', '{glutes,hamstrings,back,shoulders}', 'kettlebell', 8.0),
  ('Clean and Press', 'strength', '{full_body}', 'barbell', 6.0),
  ('Thruster', 'strength', '{full_body}', 'barbell', 6.0),
  ('Farmer''s Carry', 'strength', '{forearms,traps,abs}', 'dumbbell', 4.5),
  ('Burpee', 'strength', '{full_body}', 'bodyweight', 8.0),
  -- Cardio
  ('Running', 'cardio', '{cardio}', null, 9.8),
  ('Walking', 'cardio', '{cardio}', null, 4.3),
  ('Hiking', 'cardio', '{cardio}', null, 6.0),
  ('Cycling', 'cardio', '{cardio}', 'bike', 8.0),
  ('Stationary Bike', 'cardio', '{cardio}', 'machine', 7.0),
  ('Swimming', 'cardio', '{cardio}', null, 5.8),
  ('Rowing Machine', 'cardio', '{cardio}', 'machine', 7.0),
  ('Elliptical', 'cardio', '{cardio}', 'machine', 5.0),
  ('Stair Climber', 'cardio', '{cardio}', 'machine', 9.0),
  ('Jump Rope', 'cardio', '{cardio}', 'other', 11.8),
  ('HIIT', 'cardio', '{cardio,full_body}', null, 8.0),
  ('Yoga', 'cardio', '{full_body}', null, 2.5),
  ('Pilates', 'cardio', '{abs,full_body}', null, 3.0);
