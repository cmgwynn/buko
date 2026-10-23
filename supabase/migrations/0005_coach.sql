-- Phase 4: opt-in coach. Live model calls remain disabled until server secrets enable them.
begin;
create table if not exists public.coach_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  consent_version text check (consent_version is null or consent_version = '2026-10-23'),
  focus text not null default 'balanced' check (focus in ('balanced','protein','consistency','movement')),
  include_weight boolean not null default false,
  updated_at timestamptz not null default now()
);
create table if not exists public.coach_days (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  complete boolean not null default false,
  primary key(user_id, day)
);
create table if not exists public.coach_target_snapshots (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  calories int not null check (calories > 0),
  protein_g int not null check (protein_g >= 0),
  carbs_g int not null check (carbs_g >= 0),
  fat_g int not null check (fat_g >= 0),
  primary key(user_id, day)
);
create table if not exists public.coach_replies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('chat','weekly')),
  week_start date,
  message text check (length(message) <= 2000),
  text text not null check (length(text) <= 5000),
  suggestions jsonb not null default '[]',
  facts jsonb,
  safety boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists coach_week_cache on public.coach_replies(user_id, week_start)
  where kind = 'weekly';
create index if not exists coach_history on public.coach_replies(user_id, created_at desc);
create table if not exists public.coach_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reply_id uuid not null references public.coach_replies(id) on delete cascade,
  kind text not null check (kind in ('recipe','product')),
  title text not null,
  detail text not null,
  payload jsonb not null,
  applied_at timestamptz,
  result_id uuid
);
create table if not exists public.coach_usage (
  user_id uuid primary key references auth.users(id) on delete cascade,
  minute_start timestamptz not null,
  minute_count int not null default 0,
  day date not null,
  day_count int not null default 0
);
create table if not exists public.coach_budget (
  day date primary key,
  reserved_calls int not null default 0
);
do $$
declare t text;
begin
  foreach t in array array['coach_preferences','coach_days','coach_target_snapshots','coach_replies','coach_actions'] loop
    execute format('alter table public.%I enable row level security', t);
    if not exists(select 1 from pg_policies where schemaname='public' and tablename=t and policyname=t||'_read_own') then
      execute format('create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))',t||'_read_own',t);
      execute format('create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))',t||'_delete_own',t);
    end if;
  end loop;
  foreach t in array array['coach_preferences','coach_days','coach_target_snapshots'] loop
    if not exists(select 1 from pg_policies where schemaname='public' and tablename=t and policyname=t||'_write_own') then
      execute format('create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))',t||'_write_own',t);
      execute format('create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',t||'_update_own',t);
    end if;
  end loop;
end;
$$;
alter table public.coach_usage enable row level security;
alter table public.coach_budget enable row level security;
-- Replies/actions are created only by the Edge Function after validation; clients cannot fabricate them.
revoke insert, update on public.coach_replies, public.coach_actions from anon, authenticated;
revoke all on public.coach_usage, public.coach_budget from anon, authenticated;
grant select, delete on public.coach_replies, public.coach_actions to authenticated;
grant select, insert, update, delete on public.coach_preferences, public.coach_days, public.coach_target_snapshots to authenticated;

create or replace function public.reserve_coach_request(p_user_id uuid, p_global_limit int)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare u public.coach_usage; now_at timestamptz := clock_timestamp(); reserved int;
begin
  if p_global_limit < 1 or p_global_limit > 10000 then raise exception 'Invalid coach budget'; end if;
  insert into public.coach_usage(user_id, minute_start, day) values(p_user_id, now_at, (now_at at time zone 'UTC')::date)
    on conflict(user_id) do nothing;
  select * into u from public.coach_usage where user_id=p_user_id for update;
  if u.minute_start <= now_at - interval '1 minute' then u.minute_start:=now_at; u.minute_count:=0; end if;
  if u.day <> (now_at at time zone 'UTC')::date then u.day:=(now_at at time zone 'UTC')::date; u.day_count:=0; end if;
  if u.minute_count >= 5 or u.day_count >= 30 then return false; end if;
  insert into public.coach_budget(day, reserved_calls) values(u.day, 1)
    on conflict(day) do update set reserved_calls=coach_budget.reserved_calls+1
      where coach_budget.reserved_calls < p_global_limit returning reserved_calls into reserved;
  if reserved is null then return false; end if;
  update public.coach_usage set minute_start=u.minute_start, minute_count=u.minute_count+1,
    day=u.day, day_count=u.day_count+1 where user_id=p_user_id;
  return true;
end;
$$;
revoke all on function public.reserve_coach_request(uuid,int) from public, anon, authenticated;
grant execute on function public.reserve_coach_request(uuid,int) to service_role;

create or replace function public.publish_coach_reply(p_user_id uuid, p_reply jsonb)
returns jsonb language plpgsql security definer set search_path=public, pg_temp as $$
declare reply public.coach_replies; candidate jsonb; action_list jsonb;
begin
  perform 1 from public.coach_preferences where user_id=p_user_id and consent_version='2026-10-23' for update;
  if not found then raise exception 'Coach consent was withdrawn'; end if;
  if not coalesce((p_reply->>'safety')::boolean,false) and
    exists(select 1 from public.coach_replies where user_id=p_user_id and safety=true)
    then raise exception 'Support mode is active. Request supportive guidance instead.'; end if;
  if p_reply->>'kind'='weekly' then
    perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || (p_reply->>'week_start'),0));
    select * into reply from public.coach_replies where user_id=p_user_id and kind='weekly' and week_start=(p_reply->>'week_start')::date;
  end if;
  if reply.id is null then
    insert into public.coach_replies(user_id,kind,week_start,message,text,suggestions,facts,safety)
      values(p_user_id,p_reply->>'kind',(p_reply->>'week_start')::date,p_reply->>'message',
        p_reply->>'text',coalesce(p_reply->'suggestions','[]'),p_reply->'facts',coalesce((p_reply->>'safety')::boolean,false))
      returning * into reply;
    if not reply.safety then
      for candidate in select * from jsonb_array_elements(coalesce(p_reply->'actions','[]')) loop
        insert into public.coach_actions(user_id,reply_id,kind,title,detail,payload)
          values(p_user_id,reply.id,candidate->>'kind',candidate->>'title',candidate->>'detail',candidate->'payload');
      end loop;
    end if;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'kind',kind,'title',title,'detail',detail,'applied_at',applied_at)),'[]'::jsonb)
    into action_list from public.coach_actions where reply_id=reply.id;
  return jsonb_build_object('id',reply.id,'kind',reply.kind,'text',reply.text,'suggestions',reply.suggestions,'facts',reply.facts,'safety',reply.safety,'actions',action_list);
end;
$$;
revoke all on function public.publish_coach_reply(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.publish_coach_reply(uuid,jsonb) to service_role;

create or replace function public.apply_coach_action(p_action_id uuid, p_day date, p_meal text, p_servings numeric)
returns uuid language plpgsql security definer set search_path=public, pg_temp as $$
declare a public.coach_actions; new_id uuid; recipe uuid;
begin
  if auth.uid() is null then raise exception 'Please log in'; end if;
  select * into a from public.coach_actions where id=p_action_id and user_id=auth.uid() for update;
  if not found then raise exception 'Suggestion not found'; end if;
  perform 1 from public.coach_preferences where user_id=auth.uid() and consent_version='2026-10-23' for update;
  if not found then raise exception 'Coach consent is required'; end if;
  if exists(select 1 from public.coach_replies where user_id=auth.uid() and safety=true)
    then raise exception 'Food-planning actions are paused. Clear coach history to begin a new conversation.'; end if;
  if a.applied_at is not null then return a.result_id; end if;
  if not exists(select 1 from public.coach_replies where id=a.reply_id and created_at > now()-interval '14 days')
    then raise exception 'This suggestion has expired. Request a fresh review.'; end if;
  perform 1 from public.profiles where user_id=auth.uid() and cardinality(diet_prefs)=0 for share;
  if not found then raise exception 'Review your dietary preferences. Automatic food actions require verified suitability and are unavailable for dietary restrictions.'; end if;
  if a.kind='recipe' then
    if p_day is null or p_day < current_date-1 or p_day > current_date+90 or
      p_meal is null or p_meal not in ('breakfast','lunch','dinner','snack') or
      p_servings is null or p_servings < 0.25 or p_servings > 20 then raise exception 'Choose a valid date, meal and servings'; end if;
    recipe := (a.payload->>'recipe_id')::uuid;
    perform 1 from public.recipes where id=recipe and user_id=auth.uid() for share;
    if not found then raise exception 'Recipe no longer available'; end if;
    if not exists(select 1 from public.recipes where id=recipe and updated_at=(a.payload->>'recipe_updated_at')::timestamptz)
      then raise exception 'Recipe changed since this suggestion. Request a fresh recommendation before planning it.'; end if;
    insert into public.meal_plan_entries(user_id,planned_on,meal,recipe_id,servings)
      values(auth.uid(),p_day,p_meal,recipe,p_servings) returning id into new_id;
  else
    if a.payload->>'source_id' !~ '^[0-9]{8,14}$' then raise exception 'Invalid product'; end if;
    insert into public.grocery_items(user_id,name,source,source_id,barcode,quantity)
      values(auth.uid(),a.payload->>'name','off',a.payload->>'source_id',a.payload->>'source_id','1') returning id into new_id;
  end if;
  update public.coach_actions set applied_at=now(), result_id=new_id where id=a.id;
  return new_id;
end;
$$;
revoke all on function public.apply_coach_action(uuid,date,text,numeric) from public, anon;
grant execute on function public.apply_coach_action(uuid,date,text,numeric) to authenticated;

create or replace function public.clear_coach_history()
returns void language plpgsql security invoker set search_path=public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Please log in'; end if;
  delete from public.coach_replies where user_id=auth.uid();
end;
$$;
revoke all on function public.clear_coach_history() from public, anon;
grant execute on function public.clear_coach_history() to authenticated;
notify pgrst, 'reload schema';
commit;
