-- Phase 7: richer strength sessions, planned workouts, preferences and atomic offline replay.
alter table public.workouts add column completed_at timestamptz;
alter table public.workouts drop constraint workouts_duration_min_check;
alter table public.workouts add constraint workouts_duration_min_check check (duration_min between 0 and 5256000);
alter table public.workout_exercises
  add column rest_seconds integer check (rest_seconds between 0 and 3600),
  add column superset_id text check (char_length(superset_id) between 1 and 100);
alter table public.workout_sets
  add column completed_at timestamptz,
  add column rpe smallint check (rpe between 1 and 10);
alter table public.workouts
  add column rating text check (rating in ('easy', 'right', 'hard')),
  add column health_export_requested boolean not null default false;

create table public.workout_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_routine_id uuid references public.routines(id) on delete set null,
  default_rest_seconds integer not null default 90 check (default_rest_seconds between 0 and 3600),
  auto_start_rest boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.exercise_rest_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  rest_seconds integer not null check (rest_seconds between 0 and 3600),
  updated_at timestamptz not null default now(),
  primary key (user_id, exercise_id)
);
alter table public.exercise_rest_preferences enable row level security;
create policy "Users manage own exercise rest preferences" on public.exercise_rest_preferences
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id and exists(
    select 1 from public.exercises e where e.id = exercise_id and (e.user_id is null or e.user_id = auth.uid())
  ));
grant select, insert, update, delete on public.exercise_rest_preferences to authenticated;

create table public.planned_workouts (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  planned_for date not null,
  name text not null check (char_length(name) between 1 and 100),
  routine_id uuid references public.routines(id) on delete set null,
  notes text,
  snapshot jsonb not null default '[]'::jsonb check (jsonb_typeof(snapshot) = 'array'),
  completed_workout_id uuid references public.workouts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index planned_workouts_user_date_idx on public.planned_workouts(user_id, planned_for, created_at);
alter table public.workout_preferences enable row level security;
alter table public.planned_workouts enable row level security;
create policy "Users manage own workout preferences" on public.workout_preferences
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id and (
    last_routine_id is null or exists(select 1 from public.routines r where r.id = last_routine_id and r.user_id = auth.uid())
  ));
create policy "Users manage own planned workouts" on public.planned_workouts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id
    and (routine_id is null or exists(select 1 from public.routines r where r.id = routine_id and r.user_id = auth.uid()))
    and (completed_workout_id is null or exists(select 1 from public.workouts w where w.id = completed_workout_id and w.user_id = auth.uid()))
  );
grant select, insert, update, delete on public.workout_preferences, public.planned_workouts to authenticated;

create table public.workout_health_export_queue (
  workout_id uuid primary key references public.workouts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  requested_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'writing', 'failed', 'needs_review', 'exported')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  external_id text,
  updated_at timestamptz not null default now()
);
create index workout_health_export_owner_idx on public.workout_health_export_queue(user_id, status, requested_at);
alter table public.workout_health_export_queue enable row level security;
create policy "Users manage own workout health export jobs" on public.workout_health_export_queue
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id and exists (
    select 1 from public.workouts w where w.id = workout_id and w.user_id = auth.uid() and w.source = 'buko'
  ));
grant select, insert, update on public.workout_health_export_queue to authenticated;

create or replace function public.save_completed_workout(p_payload jsonb, p_expected_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_workout_id uuid;
  v_existing_owner uuid;
  v_existing_source text;
  v_started_at timestamptz;
  v_completed_at timestamptz;
  v_item jsonb;
  v_set jsonb;
  v_item_id uuid;
  v_exercise_id uuid;
  v_position integer;
  v_notes text;
  v_rest_seconds integer;
  v_superset_id text;
  v_set_position integer;
  v_completed_sets integer;
  v_count integer;
  v_rpe integer;
begin
  if v_user_id is null or v_user_id is distinct from p_expected_user_id then
    raise exception 'Workout account changed. Sign in again before syncing.';
  end if;
  if jsonb_typeof(p_payload) <> 'object' then raise exception 'Invalid workout payload.'; end if;
  v_workout_id := (p_payload->>'id')::uuid;
  v_started_at := (p_payload->>'started_at')::timestamptz;
  v_completed_at := coalesce(nullif(p_payload->>'completed_at', '')::timestamptz, now());
  if v_workout_id is null or v_started_at is null or v_started_at > now() + interval '5 minutes' then
    raise exception 'Invalid workout identity or dates.';
  end if;
  if char_length(coalesce(p_payload->>'name', '')) not between 1 and 100
    or jsonb_typeof(p_payload->'items') is distinct from 'array'
    or jsonb_array_length(p_payload->'items') > 200
    or char_length(coalesce(p_payload->>'notes','')) > 10000
    or v_completed_at < v_started_at or v_completed_at > now() + interval '5 minutes' then
    raise exception 'Invalid workout name or exercises.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_workout_id::text, 0));
  select w.user_id, w.source into v_existing_owner, v_existing_source from public.workouts w where w.id = v_workout_id;
  if found then
    if v_existing_owner is distinct from v_user_id or v_existing_source <> 'buko' then raise exception 'Workout is unavailable.'; end if;
    return v_workout_id;
  end if;
  if nullif(p_payload->>'routine_id','') is not null and not exists (
    select 1 from public.routines r where r.id = (p_payload->>'routine_id')::uuid and r.user_id = v_user_id
  ) then
    -- A cached routine may have been deleted while offline; keep the completed session without its template link.
    p_payload := p_payload - 'routine_id';
  end if;

  insert into public.workouts (
    id, user_id, name, started_at, completed_at, duration_min, calories_burned,
    calories_estimated, notes, routine_id, source, rating, health_export_requested
  ) values (
    v_workout_id, v_user_id, btrim(p_payload->>'name'), v_started_at, v_completed_at,
    nullif(p_payload->>'duration_min', '')::numeric,
    nullif(p_payload->>'calories_burned', '')::numeric,
    coalesce((p_payload->>'calories_estimated')::boolean, true),
    nullif(p_payload->>'notes', ''),
    nullif(p_payload->>'routine_id', '')::uuid,
    'buko',
    nullif(p_payload->>'rating', ''),
    coalesce((p_payload->>'health_export_requested')::boolean, false)
  );

  for v_item in select value from jsonb_array_elements(p_payload->'items') loop
    if jsonb_typeof(v_item->'sets') is distinct from 'array' or jsonb_array_length(v_item->'sets') > 1000 then raise exception 'Invalid workout sets.'; end if;
    select count(*) into v_completed_sets
      from jsonb_array_elements(v_item->'sets') s
      where coalesce((s->>'completed')::boolean, false)
        or nullif(s->>'completed_at', '') is not null;
    if v_completed_sets = 0 then continue; end if;

    v_item_id := (v_item->>'id')::uuid;
    v_exercise_id := (v_item->>'exercise_id')::uuid;
    v_position := (v_item->>'position')::integer;
    v_notes := nullif(v_item->>'notes', '');
    v_rest_seconds := nullif(v_item->>'rest_seconds', '')::integer;
    v_superset_id := nullif(v_item->>'superset_id', '');
    if not exists (
      select 1 from public.exercises e where e.id = v_exercise_id and (e.user_id is null or e.user_id = v_user_id)
    ) then raise exception 'Workout exercise is unavailable.'; end if;
    if v_position < 0 or v_rest_seconds < 0 or v_rest_seconds > 3600
      or char_length(coalesce(v_notes, '')) > 1000 then
      raise exception 'Invalid workout exercise details.';
    end if;
    insert into public.workout_exercises (
      id, workout_id, user_id, exercise_id, position, notes, rest_seconds, superset_id
    ) values (
      v_item_id, v_workout_id, v_user_id, v_exercise_id, v_position, v_notes, v_rest_seconds, v_superset_id
    );

    for v_set in select value from jsonb_array_elements(v_item->'sets') loop
      if not coalesce((v_set->>'completed')::boolean, false)
        and nullif(v_set->>'completed_at', '') is null then continue; end if;
      v_set_position := (v_set->>'position')::integer;
      v_rpe := nullif(v_set->>'rpe', '')::integer;
      if v_set_position < 0 or v_rpe is not null and v_rpe not between 1 and 10 then
        raise exception 'Invalid workout set details.';
      end if;
      insert into public.workout_sets (
        id, workout_exercise_id, user_id, position, reps, weight_kg, is_warmup,
        duration_s, distance_m, completed_at, rpe
      ) values (
        (v_set->>'id')::uuid, v_item_id, v_user_id, v_set_position,
        nullif(v_set->>'reps', '')::integer,
        nullif(v_set->>'weight_kg', '')::numeric,
        coalesce((v_set->>'is_warmup')::boolean, false),
        nullif(v_set->>'duration_s', '')::integer,
        nullif(v_set->>'distance_m', '')::numeric,
        coalesce(nullif(v_set->>'completed_at', '')::timestamptz, v_completed_at),
        v_rpe
      );
      v_count := coalesce(v_count, 0) + 1;
    end loop;
  end loop;
  if coalesce((p_payload->>'health_export_requested')::boolean, false) then
    insert into public.workout_health_export_queue(workout_id, user_id)
    values (v_workout_id, v_user_id);
  end if;
  if nullif(p_payload->>'planned_workout_id','') is not null then
    update public.planned_workouts set completed_workout_id = v_workout_id, updated_at = now()
    where id = (p_payload->>'planned_workout_id')::uuid and user_id = v_user_id
      and (completed_workout_id is null or completed_workout_id = v_workout_id);
  end if;
  return v_workout_id;
end;
$$;
revoke all on function public.save_completed_workout(jsonb, uuid) from public, anon;
grant execute on function public.save_completed_workout(jsonb, uuid) to authenticated;

create or replace function public.save_exercise_rest_preference(
  p_exercise_id uuid,
  p_rest_seconds integer,
  p_expected_user_id uuid
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null or v_user_id is distinct from p_expected_user_id then
    raise exception 'Workout account changed. Sign in again before syncing.';
  end if;
  if p_rest_seconds not between 0 and 3600 or not exists (
    select 1 from public.exercises
    where id = p_exercise_id and (user_id is null or user_id = v_user_id)
  ) then raise exception 'Invalid workout exercise or rest duration.'; end if;
  insert into public.exercise_rest_preferences(user_id, exercise_id, rest_seconds, updated_at)
  values(v_user_id, p_exercise_id, p_rest_seconds, now())
  on conflict(user_id, exercise_id) do update
    set rest_seconds = excluded.rest_seconds, updated_at = excluded.updated_at;
end;
$$;
revoke all on function public.save_exercise_rest_preference(uuid, integer, uuid) from public, anon;
grant execute on function public.save_exercise_rest_preference(uuid, integer, uuid) to authenticated;

create or replace function public.mark_workout_health_export(
  p_workout_id uuid,
  p_status text,
  p_error text,
  p_external_id text,
  p_expected_user_id uuid
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null or v_user_id is distinct from p_expected_user_id then
    raise exception 'Workout account changed before health export.';
  end if;
  if p_status not in ('pending','writing','failed','needs_review','exported')
    or p_status = 'exported' and nullif(p_external_id,'') is null
    or char_length(coalesce(p_error,'')) > 10000 then
    raise exception 'Invalid health export confirmation.';
  end if;
  perform 1 from public.workout_health_export_queue
    where workout_id = p_workout_id and user_id = v_user_id for update;
  if not found then raise exception 'Health export job is unavailable.'; end if;
  if p_status = 'exported' then
    update public.workouts set exported_external_id = p_external_id
      where id = p_workout_id and user_id = v_user_id and source = 'buko';
    if not found then raise exception 'Workout is unavailable.'; end if;
  end if;
  update public.workout_health_export_queue set
    status = p_status, last_error = p_error,
    external_id = coalesce(nullif(p_external_id,''), external_id),
    attempts = attempts + case when p_status = 'writing' then 1 else 0 end,
    updated_at = now()
    where workout_id = p_workout_id and user_id = v_user_id;
end;
$$;
revoke all on function public.mark_workout_health_export(uuid,text,text,text,uuid) from public,anon;
grant execute on function public.mark_workout_health_export(uuid,text,text,text,uuid) to authenticated;
