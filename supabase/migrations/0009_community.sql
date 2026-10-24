-- Members-only, explicitly published snapshots. Private recipes/photos remain private.
begin;
create table public.community_recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  private_recipe_id uuid references public.recipes on delete set null,
  parent_id uuid references public.community_recipes on delete set null,
  title text not null check (length(title) between 1 and 160),
  description text not null check (length(description) between 1 and 2000),
  meal text not null check (meal in ('Breakfast','Lunch','Dinner','Snack')),
  cuisine text not null check (cuisine in ('Italian','Mexican','American','Filipino','Mediterranean','Indian','Chinese','Japanese','Thai','Middle Eastern','Everyday')),
  tags text[] not null default '{}' check (tags <@ array['Vegan','Vegetarian','Gluten-free','Dairy-free','Nut-free']),
  payload jsonb not null check (jsonb_typeof(payload)='object' and octet_length(payload::text)<=150000),
  nutrition_score int check (nutrition_score between 0 and 100),
  calories numeric check (calories >= 0),
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  unique(user_id, private_recipe_id)
);
alter table public.recipes add column community_parent_id uuid references public.community_recipes on delete set null;
create table public.community_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  recipe_id uuid not null references public.community_recipes on delete cascade,
  stars int not null check (stars between 1 and 5),
  body text not null check (length(body)<=3000),
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,recipe_id)
);
create table public.community_blocks (
  user_id uuid not null references auth.users on delete cascade,
  blocked_user_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  primary key(user_id,blocked_user_id),
  check (user_id<>blocked_user_id)
);
create table public.community_moderators (
  user_id uuid primary key references auth.users on delete cascade
);
create table public.community_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  recipe_id uuid references public.community_recipes on delete cascade,
  review_id uuid references public.community_reviews on delete cascade,
  reason text not null check (length(reason) between 5 and 2000),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  check (num_nonnulls(recipe_id,review_id)=1)
);
create table public.community_moderation_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  recipe_id uuid references public.community_recipes on delete set null,
  review_id uuid references public.community_reviews on delete set null,
  reason text not null check (length(reason) between 5 and 2000),
  created_at timestamptz not null default now()
);
create table public.community_requests (
  user_id uuid not null references auth.users on delete cascade,
  day date not null default (now() at time zone 'utc')::date,
  count int not null default 1,
  primary key(user_id,day)
);
create index community_recipe_newest on public.community_recipes(created_at desc);
create index community_review_recipe on public.community_reviews(recipe_id);
create index community_block_reverse on public.community_blocks(blocked_user_id,user_id);
create index community_report_pending on public.community_reports(created_at) where resolved_at is null;
alter table public.community_recipes enable row level security;
alter table public.community_reviews enable row level security;
alter table public.community_blocks enable row level security;
alter table public.community_moderators enable row level security;
alter table public.community_reports enable row level security;
alter table public.community_moderation_log enable row level security;
alter table public.community_requests enable row level security;
-- No direct member table access: bounded RPCs apply blocking and hide moderation data.
revoke all on public.community_recipes,public.community_reviews,public.community_blocks,
 public.community_moderators,public.community_reports,public.community_moderation_log,public.community_requests from public,anon,authenticated;
grant all on public.community_recipes,public.community_reviews,public.community_blocks,
 public.community_moderators,public.community_reports,public.community_moderation_log,public.community_requests to service_role;

create function public.community_member()
returns uuid language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
  if auth.uid() is null or not exists(select 1 from auth.users where id=auth.uid()) then
    raise exception 'Sign in to browse shared recipes';
  end if;
  return auth.uid();
end $$;
create function public.community_limit(p_user uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare n int;
begin
  -- Serialize all contributions per member; failed transactions do not consume quota.
  perform 1 from auth.users where id=p_user for update;
  if not found then raise exception 'Account no longer exists'; end if;
  insert into public.community_requests(user_id) values(p_user)
  on conflict(user_id,day) do update set count=community_requests.count+1 returning count into n;
  if n>100 then raise exception 'Recipe-sharing daily limit reached. Try again tomorrow.'; end if;
end $$;
create function public.community_visible(p_owner uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
  select not exists(select 1 from public.community_blocks
    where (user_id=auth.uid() and blocked_user_id=p_owner)
       or (user_id=p_owner and blocked_user_id=auth.uid()));
$$;
create function public.community_is_moderator()
returns boolean language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
  perform public.community_member();
  return exists(select 1 from public.community_moderators where user_id=auth.uid());
end $$;

create function public.community_browse(p_query text default '',p_meal text default null,p_cuisine text default null,
 p_tags text[] default '{}',p_green boolean default false,p_sort text default 'newest',p_offset int default 0)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare result jsonb;
begin
  perform public.community_member();
  if p_offset is null or p_offset<0 or p_offset>10000 or p_query is null or length(p_query)>120
    or p_tags is null or cardinality(p_tags)>5 or not (p_tags <@ array['Vegan','Vegetarian','Gluten-free','Dairy-free','Nut-free'])
    or p_green is null or p_sort is null or p_sort not in ('newest','rating','nutrition')
    or (p_meal is not null and p_meal not in ('Breakfast','Lunch','Dinner','Snack'))
    or (p_cuisine is not null and p_cuisine not in ('Italian','Mexican','American','Filipino','Mediterranean','Indian','Chinese','Japanese','Thai','Middle Eastern','Everyday'))
    then raise exception 'Invalid library filters'; end if;
  with candidates as (
    select r.id,r.user_id,r.title,r.description,r.meal,r.cuisine,r.tags,r.nutrition_score,r.calories,
      r.parent_id,r.created_at,coalesce(v.n,0) as review_count,v.average_rating,
      (coalesce(v.total,0)+17.5)/(coalesce(v.n,0)+5) as ranking
    from public.community_recipes r
    left join lateral (
      select count(*) as n,avg(stars)::numeric(3,2) as average_rating,sum(stars) as total
      from public.community_reviews v where v.recipe_id=r.id and not v.hidden and public.community_visible(v.user_id)
    ) v on true
    where not r.hidden and public.community_visible(r.user_id)
      and (p_meal is null or r.meal=p_meal) and (p_cuisine is null or r.cuisine=p_cuisine)
      and r.tags @> p_tags and (not p_green or r.nutrition_score>=75)
      and (p_query='' or strpos(lower(r.title||' '||r.description||' '||coalesce(r.payload->>'search','')),lower(p_query))>0)
  ), page as (
    select * from candidates
    order by case when p_sort='rating' then ranking end desc nulls last,
      case when p_sort='nutrition' then nutrition_score end desc nulls last,created_at desc,id
    limit 12 offset p_offset
  )
  select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(p)) from page p),'[]'::jsonb),
    'total',(select count(*) from candidates)) into result;
  return result;
end $$;

create function public.community_detail(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare r public.community_recipes; reviews jsonb; variations jsonb;
begin
  perform public.community_member();
  select * into r from public.community_recipes where id=p_id and not hidden and public.community_visible(user_id);
  if not found then raise exception 'Recipe unavailable or blocked'; end if;
  select coalesce(jsonb_agg(to_jsonb(v)),'[]'::jsonb) into reviews from (
    select id,user_id,stars,body,created_at,updated_at from public.community_reviews
    where recipe_id=p_id and not hidden and public.community_visible(user_id)
    order by updated_at desc,id limit 50
  ) v;
  select coalesce(jsonb_agg(to_jsonb(v)),'[]'::jsonb) into variations from (
    select id,title,nutrition_score from public.community_recipes
    where parent_id=p_id and not hidden and public.community_visible(user_id) order by created_at desc limit 20
  ) v;
  return jsonb_build_object('recipe',to_jsonb(r)-'private_recipe_id','reviews',reviews,'variations',variations,
    'myReview',(select to_jsonb(v)-'hidden' from public.community_reviews v where recipe_id=p_id and user_id=auth.uid() and not hidden),
    'reviewCount',(select count(*) from public.community_reviews where recipe_id=p_id and not hidden and public.community_visible(user_id)),
    'averageRating',(select avg(stars)::numeric(3,2) from public.community_reviews where recipe_id=p_id and not hidden and public.community_visible(user_id)));
end $$;

-- Only the authenticated Edge Function's service role may publish a scored snapshot.
create function public.community_publish(p_user uuid,p_private uuid,p_description text,p_meal text,p_cuisine text,
 p_tags text[],p_payload jsonb,p_score int,p_calories numeric,p_parent uuid)
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare result uuid;
begin
  perform public.community_limit(p_user);
  if not exists(select 1 from public.community_moderators) then
    raise exception 'Recipe sharing needs a designated moderator. Contact the Buko owner.';
  end if;
  perform 1 from public.recipes where id=p_private and user_id=p_user for share;
  if not found then raise exception 'Only your own saved recipe can be published'; end if;
  if p_parent is not null and not exists(select 1 from public.community_recipes r where id=p_parent and not hidden
    and not exists(select 1 from public.community_blocks b
      where (b.user_id=p_user and b.blocked_user_id=r.user_id) or (b.user_id=r.user_id and b.blocked_user_id=p_user))) then
    raise exception 'The original shared recipe is no longer available';
  end if;
  if (select count(*) from public.community_recipes where user_id=p_user and created_at>now()-interval '1 day')>=10 then
    raise exception 'Publish limit reached: ten recipes per day';
  end if;
  insert into public.community_recipes(user_id,private_recipe_id,parent_id,title,description,meal,cuisine,tags,payload,nutrition_score,calories)
  values(p_user,p_private,p_parent,p_payload->>'title',p_description,p_meal,p_cuisine,p_tags,p_payload,p_score,p_calories)
  returning id into result;
  return result;
end $$;
create function public.community_review(p_recipe uuid,p_stars int,p_body text)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare me uuid:=public.community_member();
begin
  perform public.community_limit(me);
  if not exists(select 1 from public.community_recipes where id=p_recipe and not hidden and user_id<>me and public.community_visible(user_id))
    then raise exception 'You cannot review your own or an unavailable recipe'; end if;
  if exists(select 1 from public.community_reviews where recipe_id=p_recipe and user_id=me and hidden)
    then raise exception 'This review was removed by moderation'; end if;
  insert into public.community_reviews(user_id,recipe_id,stars,body) values(me,p_recipe,p_stars,trim(p_body))
  on conflict(user_id,recipe_id) do update set stars=excluded.stars,body=excluded.body,updated_at=now();
end $$;
create function public.community_remove(p_id uuid,p_kind text)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare me uuid:=public.community_member();
begin
  perform public.community_limit(me);
  if p_kind='recipe' then
    update public.community_recipes set hidden=true where id=p_id and user_id=me;
  elsif p_kind='review' then
    delete from public.community_reviews where id=p_id and user_id=me;
  else raise exception 'Invalid contribution type'; end if;
  if not found then raise exception 'Contribution not found or not yours'; end if;
end $$;
create function public.community_report(p_id uuid,p_kind text,p_reason text)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare me uuid:=public.community_member();
begin
  perform public.community_limit(me);
  if p_kind='recipe' and exists(select 1 from public.community_recipes where id=p_id and not hidden and public.community_visible(user_id)) then
    insert into public.community_reports(user_id,recipe_id,reason) values(me,p_id,trim(p_reason));
  elsif p_kind='review' and exists(select 1 from public.community_reviews v join public.community_recipes r on r.id=v.recipe_id
    where v.id=p_id and not v.hidden and not r.hidden and public.community_visible(v.user_id) and public.community_visible(r.user_id)) then
    insert into public.community_reports(user_id,review_id,reason) values(me,p_id,trim(p_reason));
  else raise exception 'Contribution unavailable'; end if;
end $$;
create function public.community_block(p_user uuid,p_block boolean)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare me uuid:=public.community_member();
begin
  perform public.community_limit(me);
  if p_block is null then raise exception 'Choose block or unblock'; end if;
  if p_block then insert into public.community_blocks(user_id,blocked_user_id) values(me,p_user) on conflict do nothing;
  else delete from public.community_blocks where user_id=me and blocked_user_id=p_user; end if;
end $$;
create function public.community_my_blocks()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
  perform public.community_member();
  return coalesce((select jsonb_agg(blocked_user_id) from public.community_blocks where user_id=auth.uid()),'[]'::jsonb);
end $$;
create function public.community_reports_queue()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
  if not public.community_is_moderator() then raise exception 'Moderator access required'; end if;
  return coalesce((select jsonb_agg(to_jsonb(q)) from (
    select p.*,coalesce(r.title,vr.title) as recipe_title,v.body as review_body
    from public.community_reports p
    left join public.community_recipes r on r.id=p.recipe_id
    left join public.community_reviews v on v.id=p.review_id
    left join public.community_recipes vr on vr.id=v.recipe_id
    where p.resolved_at is null order by p.created_at limit 50
  ) q),'[]'::jsonb);
end $$;
create function public.community_moderate(p_report uuid,p_remove boolean,p_reason text)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare r public.community_reports;
begin
  if not public.community_is_moderator() then raise exception 'Moderator access required'; end if;
  if p_remove is null then raise exception 'Choose remove or keep'; end if;
  if p_reason is null or length(trim(p_reason)) not between 5 and 2000 then raise exception 'Explain the moderation decision'; end if;
  select * into r from public.community_reports where id=p_report and resolved_at is null for update;
  if not found then raise exception 'Report already resolved or unavailable'; end if;
  if p_remove then
    update public.community_recipes set hidden=true where id=r.recipe_id;
    update public.community_reviews set hidden=true where id=r.review_id;
  end if;
  insert into public.community_moderation_log(user_id,recipe_id,review_id,reason)
    values(auth.uid(),r.recipe_id,r.review_id,case when p_remove then 'Removed: ' else 'Kept: ' end||trim(p_reason));
  update public.community_reports set resolved_at=now() where id=p_report;
end $$;
revoke all on function public.community_member(),public.community_limit(uuid),public.community_visible(uuid),
 public.community_publish(uuid,uuid,text,text,text,text[],jsonb,int,numeric,uuid),
 public.community_is_moderator(),public.community_browse(text,text,text,text[],boolean,text,int),
 public.community_detail(uuid),public.community_review(uuid,int,text),public.community_remove(uuid,text),
 public.community_report(uuid,text,text),public.community_block(uuid,boolean),public.community_my_blocks(),
 public.community_reports_queue(),public.community_moderate(uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.community_publish(uuid,uuid,text,text,text,text[],jsonb,int,numeric,uuid) to service_role;
grant execute on function public.community_is_moderator(),public.community_browse(text,text,text,text[],boolean,text,int),
 public.community_detail(uuid),public.community_review(uuid,int,text),public.community_remove(uuid,text),
 public.community_report(uuid,text,text),public.community_block(uuid,boolean),public.community_my_blocks(),
 public.community_reports_queue(),public.community_moderate(uuid,boolean,text) to authenticated;
notify pgrst,'reload schema';
commit;
