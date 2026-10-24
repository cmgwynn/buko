begin;
create table public.food_favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  food_key text not null,
  snapshot jsonb not null,
  updated_at timestamptz not null default now(),
  unique(user_id,food_key)
);
alter table public.food_favorites enable row level security;
create policy food_favorites_select_own on public.food_favorites for select to authenticated using (user_id=(select auth.uid()));
revoke all on public.food_favorites from public,anon,authenticated;
grant select on public.food_favorites to authenticated;

create table public.diary_action_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  arguments jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key(user_id,request_id)
);
alter table public.diary_action_receipts enable row level security;
revoke all on public.diary_action_receipts from public,anon,authenticated;

create function public.diary_favorite(p_entry uuid,p_enabled boolean,p_expected_user_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare owner uuid:=auth.uid(); e public.food_log_entries; v_food_key text;
begin
  if owner is null or owner is distinct from p_expected_user_id then raise exception 'Sign in to the expected account'; end if;
  if p_enabled is null then raise exception 'Choose whether to save this food'; end if;
  select * into e from public.food_log_entries where id=p_entry and user_id=owner;
  if not found then raise exception 'Food entry is unavailable'; end if;
  v_food_key:=e.source||':'||coalesce(e.source_id,e.name);
  if not p_enabled then
    delete from public.food_favorites f where f.user_id=owner and f.food_key=v_food_key;
    return;
  end if;
  perform 1 from auth.users where id=owner for update;
  if (select count(*) from public.food_favorites where user_id=owner)>=500
    and not exists(select 1 from public.food_favorites f where f.user_id=owner and f.food_key=v_food_key)
    then raise exception 'Your favorites list is full (500). Remove a favorite first'; end if;
  insert into public.food_favorites(user_id,food_key,snapshot)
    values(owner,v_food_key,jsonb_build_object(
      'source',e.source,'source_id',e.source_id,'name',e.name,'brand',e.brand,'quantity',e.quantity,
      'unit',e.unit,'grams',e.grams,'calories',e.calories,'protein_g',e.protein_g,'carbs_g',e.carbs_g,'fat_g',e.fat_g))
    on conflict(user_id,food_key) do update set snapshot=excluded.snapshot,updated_at=now();
end $$;
create function public.diary_remove_favorite(p_id uuid,p_expected_user_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if auth.uid() is null or auth.uid() is distinct from p_expected_user_id then raise exception 'Sign in to the expected account'; end if;
  delete from public.food_favorites where id=p_id and user_id=auth.uid();
  if not found then raise exception 'Favorite is unavailable'; end if;
end $$;

create function public.diary_transfer(p_request_id uuid,p_expected_user_id uuid,p_mode text,p_target_date date,
  p_today date,p_entry uuid default null,p_source_date date default null,p_target_meal text default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare owner uuid:=auth.uid(); e public.food_log_entries; inserted public.food_log_entries;
  args jsonb; previous public.diary_action_receipts; output jsonb:='[]'; candidates uuid[]:='{}';
  matched uuid[]:='{}'; match_id uuid; source_count int; target_count int;
begin
  if owner is null or owner is distinct from p_expected_user_id then raise exception 'Sign in to the expected account'; end if;
  if p_request_id is null or p_mode is null or p_mode not in ('move','copy','day','meal')
    or p_target_date is null or p_target_date<'1900-01-01' or p_target_date>'2100-12-31'
    or p_today is null or p_today not between current_date-1 and current_date+1 or p_target_date>p_today
    or (p_target_meal is not null and p_target_meal not in ('breakfast','lunch','dinner','snack'))
    or (p_mode in ('day','meal') and (p_source_date is null or p_source_date=p_target_date or p_entry is not null))
    or (p_mode='day' and p_target_meal is not null)
    or (p_mode='meal' and p_target_meal is null)
    or (p_mode in ('copy','move') and (p_entry is null or p_target_meal is null or p_source_date is not null))
    then raise exception 'Choose a valid past or current date and meal'; end if;
  args:=jsonb_build_object('mode',p_mode,'date',p_target_date,'entry',p_entry,'source',p_source_date,'meal',p_target_meal);
  perform 1 from auth.users where id=owner for update;
  select * into previous from public.diary_action_receipts where user_id=owner and request_id=p_request_id;
  if found then
    if previous.arguments<>args then raise exception 'This request was already used for another action'; end if;
    return previous.result;
  end if;
  if (select count(*) from public.diary_action_receipts where user_id=owner and created_at>=date_trunc('day',now()))>=500
    then raise exception 'Daily diary action limit reached. Please try again tomorrow'; end if;
  if p_mode in ('day','meal') then
    select count(*) into source_count from public.food_log_entries where user_id=owner and logged_on=p_source_date and (p_mode='day' or meal=p_target_meal);
    if source_count=0 then raise exception 'No food is logged on the source day'; end if;
    if source_count>500 then raise exception 'This day has too many entries to copy at once'; end if;
    for e in select * from public.food_log_entries f
      where user_id=owner and logged_on=p_source_date and (p_mode='day' or meal=p_target_meal) order by created_at,id
    loop
      select t.id into match_id from public.food_log_entries t
        where t.user_id=owner and t.logged_on=p_target_date and t.meal=e.meal and t.source=e.source
          and coalesce(t.source_id,t.name)=coalesce(e.source_id,e.name) and abs(t.grams-e.grams)<0.05
          and not(t.id=any(matched)) order by t.created_at,t.id limit 1;
      if found then matched:=array_append(matched,match_id);
      else candidates:=array_append(candidates,e.id); end if;
    end loop;
  else
    select * into e from public.food_log_entries where user_id=owner and id=p_entry for update;
    if not found then raise exception 'Food entry is unavailable'; end if;
    if p_mode='move' and e.logged_on=p_target_date and e.meal=p_target_meal then raise exception 'This food is already in that meal'; end if;
    candidates:=array[p_entry]; source_count:=1;
  end if;
  foreach p_entry in array coalesce(candidates,'{}'::uuid[]) loop
    select * into e from public.food_log_entries where id=p_entry and user_id=owner;
    if not found then raise exception 'Food entry changed. Refresh and retry'; end if;
    if p_mode='move' then
      update public.food_log_entries set logged_on=p_target_date,meal=p_target_meal
        where id=e.id and user_id=owner returning * into inserted;
    else
      insert into public.food_log_entries(user_id,logged_on,meal,source,source_id,name,brand,quantity,unit,grams,calories,protein_g,carbs_g,fat_g)
        values(owner,p_target_date,coalesce(p_target_meal,e.meal),e.source,e.source_id,e.name,e.brand,e.quantity,e.unit,e.grams,e.calories,e.protein_g,e.carbs_g,e.fat_g)
        returning * into inserted;
    end if;
    output:=output||jsonb_build_array(jsonb_build_object('id',inserted.id,'health_external_id',case when p_mode='move' then e.health_external_id else null end));
  end loop;
  target_count:=jsonb_array_length(output);
  output:=jsonb_build_object('entries',output,'changed',target_count,'skipped',source_count-target_count);
  insert into public.diary_action_receipts(user_id,request_id,arguments,result) values(owner,p_request_id,args,output);
  return output;
end $$;

create function public.diary_history_search(p_query text,p_offset int default 0)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare pattern text; result jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in to search your diary'; end if;
  if p_query is null or length(btrim(p_query)) not between 2 and 100 or p_offset is null or p_offset<0 or p_offset>10000
    then raise exception 'Enter 2-100 characters to search your diary'; end if;
  pattern:='%'||replace(replace(replace(btrim(p_query),'\','\\'),'%','\%'),'_','\_')||'%';
  select jsonb_build_object('rows',coalesce(jsonb_agg(to_jsonb(page)),'[]')) into result from (
    select * from public.food_log_entries where user_id=auth.uid() and (name ilike pattern escape '\' or brand ilike pattern escape '\')
    order by logged_on desc,created_at desc,id desc limit 21 offset p_offset
  ) page;
  return result;
end $$;
revoke all on function public.diary_favorite(uuid,boolean,uuid),public.diary_remove_favorite(uuid,uuid),
  public.diary_transfer(uuid,uuid,text,date,date,uuid,date,text),public.diary_history_search(text,int) from public,anon;
grant execute on function public.diary_favorite(uuid,boolean,uuid),public.diary_remove_favorite(uuid,uuid),
  public.diary_transfer(uuid,uuid,text,date,date,uuid,date,text),public.diary_history_search(text,int) to authenticated;
notify pgrst,'reload schema';
commit;
