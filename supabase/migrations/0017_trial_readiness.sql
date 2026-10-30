-- Trial readiness: free meal planning, in-app feedback and anonymous daily usage counts.

-- Meal planning is free. Buko Plus keeps Coach, AI recipe suggestions and health-app sync.
drop policy if exists premium_plan_insert on public.meal_plan_entries;
drop policy if exists premium_plan_update on public.meal_plan_entries;
drop trigger if exists plan_edit_premium on public.meal_plan_entries;
drop function if exists public.check_plan_edit_premium();

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('bug','idea','confusing','praise')),
  message text not null check (char_length(btrim(message)) between 3 and 2000),
  screen text check (screen is null or char_length(screen) <= 80),
  platform text not null check (platform in ('ios','android','web')),
  app_version text check (app_version is null or char_length(app_version) <= 40),
  created_at timestamptz not null default now()
);
create index if not exists feedback_user_created on public.feedback(user_id, created_at desc);
alter table public.feedback enable row level security;
drop policy if exists feedback_insert_own on public.feedback;
create policy feedback_insert_own on public.feedback for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists feedback_read_own on public.feedback;
create policy feedback_read_own on public.feedback for select to authenticated
  using ((select auth.uid()) = user_id);
grant select, insert on public.feedback to authenticated;

create or replace function public.feedback_rate_limit()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform pg_advisory_xact_lock(hashtext('feedback:' || new.user_id::text));
  if (select count(*) from public.feedback where user_id = new.user_id and created_at > now() - interval '1 day') >= 10 then
    raise exception 'Feedback limit reached for today. Thank you, please try again tomorrow.';
  end if;
  return new;
end;
$$;
revoke all on function public.feedback_rate_limit() from public, anon, authenticated;
drop trigger if exists feedback_rate_limit on public.feedback;
create trigger feedback_rate_limit before insert on public.feedback for each row execute function public.feedback_rate_limit();

-- Aggregate counts only: no user id, device id or content is stored.
create table if not exists public.usage_daily (
  day date not null,
  platform text not null check (platform in ('ios','android','web')),
  cohort_week date not null,
  active_users integer not null default 0 check (active_users >= 0),
  primary key (day, platform, cohort_week)
);
alter table public.usage_daily enable row level security;
revoke all on public.usage_daily from public, anon, authenticated;

-- Same-day de-duplication uses a random salt per day. Yesterday's salt and markers are deleted, so markers cannot be linked to accounts afterwards.
create table if not exists public.usage_daily_salt (day date primary key, salt text not null);
create table if not exists public.usage_daily_seen (day date not null, marker text not null, primary key (day, marker));
alter table public.usage_daily_salt enable row level security;
alter table public.usage_daily_seen enable row level security;
revoke all on public.usage_daily_salt, public.usage_daily_seen from public, anon, authenticated;

create or replace function public.record_daily_use(p_platform text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare cohort date; today_salt text; inserted int;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if p_platform not in ('ios','android','web') then raise exception 'Unknown platform'; end if;
  delete from public.usage_daily_seen where day < current_date;
  delete from public.usage_daily_salt where day < current_date;
  insert into public.usage_daily_salt(day, salt) values (current_date, gen_random_uuid()::text) on conflict (day) do nothing;
  select salt into today_salt from public.usage_daily_salt where day = current_date;
  insert into public.usage_daily_seen(day, marker) values (current_date, md5(today_salt || auth.uid()::text)) on conflict do nothing;
  get diagnostics inserted = row_count;
  if inserted = 0 then return; end if;
  select date_trunc('week', u.created_at)::date into cohort from auth.users u where u.id = auth.uid();
  insert into public.usage_daily(day, platform, cohort_week, active_users)
    values (current_date, p_platform, coalesce(cohort, date_trunc('week', current_date)::date), 1)
    on conflict (day, platform, cohort_week) do update set active_users = public.usage_daily.active_users + 1;
end;
$$;
revoke all on function public.record_daily_use(text) from public, anon;
grant execute on function public.record_daily_use(text) to authenticated;
