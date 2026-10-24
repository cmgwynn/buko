-- Optional pseudonymous public names and explicit variation change notes for shared recipes.
-- Aliases are member-chosen only: Buko never derives them from auth names or email addresses.
begin;
create table public.community_profiles (
  user_id uuid primary key references auth.users on delete cascade,
  alias text not null check (
    alias = btrim(alias) and length(alias) between 3 and 30
    and alias ~ '^[A-Za-z0-9][A-Za-z0-9 _.-]*[A-Za-z0-9]$' and alias !~ '  '
    and lower(alias) !~ '(^|[^a-z])(buko|admin|administrator|moderator|official|support|staff)([^a-z]|$)'
  ),
  updated_at timestamptz not null default now()
);
create unique index community_profiles_alias_unique on public.community_profiles (lower(alias));
alter table public.community_profiles enable row level security;
revoke all on public.community_profiles from public, anon, authenticated;
grant all on public.community_profiles to service_role;

alter table public.community_recipes
  add column change_summary text check (change_summary is null or (change_summary = btrim(change_summary) and length(change_summary) between 3 and 1000));

create function public.community_my_alias()
returns text language plpgsql stable security definer set search_path = pg_catalog, public as $$
begin
  perform public.community_member();
  return (select alias from public.community_profiles where user_id = auth.uid());
end $$;

-- Null or blank removes the alias; contributions then show the generic member label again.
create function public.community_set_alias(p_alias text)
returns text language plpgsql security definer set search_path = pg_catalog, public as $$
declare me uuid := public.community_member(); clean text := nullif(btrim(coalesce(p_alias, '')), '');
begin
  perform public.community_limit(me);
  if clean is null then
    delete from public.community_profiles where user_id = me;
    return null;
  end if;
  if exists(select 1 from public.community_profiles where lower(alias) = lower(clean) and user_id <> me) then
    raise exception 'That public name is already in use';
  end if;
  insert into public.community_profiles(user_id, alias) values (me, clean)
  on conflict (user_id) do update set alias = excluded.alias, updated_at = now();
  return clean;
exception
when unique_violation then raise exception 'That public name is already in use';
when check_violation then
  raise exception 'Use 3-30 letters, numbers, spaces, dots, dashes or underscores. Avoid official-sounding names.';
end $$;

-- Only aliases of visible, unblocked contributors are returned; there is no member directory.
create function public.community_aliases(p_users uuid[])
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public as $$
begin
  perform public.community_member();
  if p_users is null or cardinality(p_users) > 100 then raise exception 'Invalid alias lookup'; end if;
  return coalesce((select jsonb_object_agg(p.user_id, p.alias) from public.community_profiles p
    where p.user_id = any(p_users) and public.community_visible(p.user_id)
      and (exists(select 1 from public.community_recipes r where r.user_id = p.user_id and not r.hidden)
        or exists(select 1 from public.community_reviews v join public.community_recipes r on r.id = v.recipe_id
          where v.user_id = p.user_id and not v.hidden and not r.hidden))), '{}'::jsonb);
end $$;

drop function public.community_publish(uuid,uuid,text,text,text,text[],jsonb,int,numeric,uuid);
create function public.community_publish(p_user uuid,p_private uuid,p_description text,p_meal text,p_cuisine text,
 p_tags text[],p_payload jsonb,p_score int,p_calories numeric,p_parent uuid,p_changes text default null)
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare result uuid; changes text := nullif(btrim(coalesce(p_changes, '')), '');
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
  if p_parent is not null and (changes is null or length(changes) not between 3 and 1000) then
    raise exception 'Describe what changed in this variation';
  end if;
  if p_parent is null and changes is not null then raise exception 'Only variations can include change notes'; end if;
  if (select count(*) from public.community_recipes where user_id=p_user and created_at>now()-interval '1 day')>=10 then
    raise exception 'Publish limit reached: ten recipes per day';
  end if;
  insert into public.community_recipes(user_id,private_recipe_id,parent_id,title,description,meal,cuisine,tags,payload,nutrition_score,calories,change_summary)
  values(p_user,p_private,p_parent,p_payload->>'title',p_description,p_meal,p_cuisine,p_tags,p_payload,p_score,p_calories,changes)
  returning id into result;
  return result;
end $$;

revoke all on function public.community_my_alias(), public.community_set_alias(text), public.community_aliases(uuid[]),
 public.community_publish(uuid,uuid,text,text,text,text[],jsonb,int,numeric,uuid,text) from public, anon, authenticated;
grant execute on function public.community_publish(uuid,uuid,text,text,text,text[],jsonb,int,numeric,uuid,text) to service_role;
grant execute on function public.community_my_alias(), public.community_set_alias(text), public.community_aliases(uuid[]) to authenticated;
notify pgrst, 'reload schema';
commit;
