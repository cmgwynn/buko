begin;
create table if not exists public.billing_config (
  singleton boolean primary key default true check(singleton),
  enforce_premium boolean not null default false,
  allow_sandbox boolean not null default false
);
insert into public.billing_config(singleton) values(true) on conflict do nothing;
create table if not exists public.subscription_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  expires_at timestamptz,
  verified_at timestamptz not null default now(),
  sandbox boolean not null default false
);
create table if not exists public.billing_usage (
  user_id uuid primary key references auth.users(id) on delete cascade,
  minute_start timestamptz not null default now(),
  count int not null default 0
);
alter table public.billing_config enable row level security;
alter table public.subscription_access enable row level security;
alter table public.billing_usage enable row level security;
revoke all on public.billing_config, public.subscription_access, public.billing_usage from anon, authenticated;
grant select on public.billing_config, public.subscription_access to authenticated;
grant all on public.billing_config, public.subscription_access, public.billing_usage to service_role;
drop policy if exists billing_config_read on public.billing_config;
create policy billing_config_read on public.billing_config for select to authenticated using(true);
drop policy if exists subscription_read_own on public.subscription_access;
create policy subscription_read_own on public.subscription_access for select to authenticated using(user_id=(select auth.uid()));

create or replace function public.has_premium_access()
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select auth.uid() is not null and (
    exists(select 1 from public.billing_config where not enforce_premium)
    or exists(select 1 from public.subscription_access s cross join public.billing_config c
      where s.user_id=auth.uid() and s.expires_at>now()
        and s.verified_at>now()-interval '15 minutes' and (not s.sandbox or c.allow_sandbox))
  );
$$;
revoke all on function public.has_premium_access() from public,anon;
grant execute on function public.has_premium_access() to authenticated,service_role;

create or replace function public.reserve_billing_refresh(p_user_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.billing_usage;
begin
  insert into public.billing_usage(user_id) values(p_user_id) on conflict do nothing;
  select * into r from public.billing_usage where user_id=p_user_id for update;
  if r.minute_start<=clock_timestamp()-interval '1 minute' then r.minute_start:=clock_timestamp();r.count:=0;end if;
  if r.count>=10 then return false;end if;
  update public.billing_usage set minute_start=r.minute_start,count=r.count+1 where user_id=p_user_id;
  return true;
end;
$$;
revoke all on function public.reserve_billing_refresh(uuid) from public,anon,authenticated;
grant execute on function public.reserve_billing_refresh(uuid) to service_role;

-- Restrictive policies compose with existing owner-only policies; historical reads/deletes remain available.
drop policy if exists premium_plan_insert on public.meal_plan_entries;
create policy premium_plan_insert on public.meal_plan_entries as restrictive for insert to authenticated
  with check(public.has_premium_access());
drop policy if exists premium_plan_update on public.meal_plan_entries;
create policy premium_plan_update on public.meal_plan_entries as restrictive for update to authenticated
  using(true) with check(true);
create or replace function public.check_plan_edit_premium()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is not null and not public.has_premium_access() and
    (new.user_id,new.planned_on,new.meal,new.recipe_id,new.servings) is distinct from
    (old.user_id,old.planned_on,old.meal,old.recipe_id,old.servings)
    then raise exception 'Buko Premium is required to edit a meal plan. Logging existing meals remains free.'; end if;
  return new;
end;
$$;
revoke all on function public.check_plan_edit_premium() from public,anon,authenticated;
drop trigger if exists plan_edit_premium on public.meal_plan_entries;
create trigger plan_edit_premium before update on public.meal_plan_entries for each row execute function public.check_plan_edit_premium();
drop policy if exists premium_activity_insert on public.daily_activity;
create policy premium_activity_insert on public.daily_activity as restrictive for insert to authenticated
  with check(public.has_premium_access());
drop policy if exists premium_activity_update on public.daily_activity;
create policy premium_activity_update on public.daily_activity as restrictive for update to authenticated
  using(public.has_premium_access()) with check(public.has_premium_access());
drop policy if exists premium_workout_import on public.workouts;
create policy premium_workout_import on public.workouts as restrictive for insert to authenticated
  with check(source='buko' or public.has_premium_access());
create or replace function public.check_coach_action_premium()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.applied_at is distinct from old.applied_at and auth.uid() is not null and not public.has_premium_access()
    then raise exception 'Buko Premium is required to apply Coach suggestions.'; end if;
  return new;
end;
$$;
revoke all on function public.check_coach_action_premium() from public,anon,authenticated;
drop trigger if exists coach_action_premium on public.coach_actions;
create trigger coach_action_premium before update on public.coach_actions for each row execute function public.check_coach_action_premium();
notify pgrst,'reload schema';
commit;
