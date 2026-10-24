begin;
create table if not exists public.diagnostic_usage (
  user_id uuid primary key references auth.users(id) on delete cascade,
  minute_start timestamptz not null default now(),
  count int not null default 0
);
alter table public.diagnostic_usage enable row level security;
revoke all on public.diagnostic_usage from anon,authenticated;
grant all on public.diagnostic_usage to service_role;
create or replace function public.reserve_diagnostic(p_user_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.diagnostic_usage;
begin
  insert into public.diagnostic_usage(user_id) values(p_user_id) on conflict do nothing;
  select * into r from public.diagnostic_usage where user_id=p_user_id for update;
  if r.minute_start<=clock_timestamp()-interval '1 minute' then r.minute_start:=clock_timestamp();r.count:=0;end if;
  if r.count>=5 then return false;end if;
  update public.diagnostic_usage set minute_start=r.minute_start,count=r.count+1 where user_id=p_user_id;
  return true;
end;
$$;
revoke all on function public.reserve_diagnostic(uuid) from public,anon,authenticated;
grant execute on function public.reserve_diagnostic(uuid) to service_role;
notify pgrst,'reload schema';
commit;
