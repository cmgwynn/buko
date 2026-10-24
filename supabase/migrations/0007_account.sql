-- Service-only account export, including future UUID user_id tables.
begin;
create or replace function public.account_export_tables()
returns jsonb language sql stable security definer set search_path = pg_catalog, public as $$
  select coalesce(jsonb_agg(c.relname order by c.relname), '[]'::jsonb)
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid and a.attname = 'user_id' and not a.attisdropped
  where n.nspname = 'public' and c.relkind in ('r','p') and a.atttypid = 'uuid'::regtype
    and not c.relispartition;
$$;

create or replace function public.account_export_page(p_user_id uuid, p_table text, p_offset int, p_limit int)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare result jsonb; total bigint; revision text;
begin
  if p_user_id is null or p_table is null or p_offset is null or p_limit is null or p_offset < 0 or p_limit < 1 or p_limit > 500
    or not (public.account_export_tables() ? p_table) then
    raise exception 'Invalid account export request';
  end if;
  execute format('select count(*) from public.%I where user_id=$1', p_table) into total using p_user_id;
  if total > 25000 then
    return jsonb_build_object('rows','[]'::jsonb,'total',total,'revision','assisted-export-required');
  end if;
  -- A digest detects inserts, updates and deletes between pages, including same-count changes.
  execute format(
    'select md5(coalesce(string_agg(md5(to_jsonb(t)::text),'''' order by to_jsonb(t)::text),'''')) from public.%I t where user_id=$1',
    p_table) into revision using p_user_id;
  execute format(
    'select coalesce(jsonb_agg(row),''[]''::jsonb) from (select to_jsonb(t) as row from public.%I t where user_id=$1 order by to_jsonb(t)::text offset $2 limit $3) s',
    p_table) into result using p_user_id, p_offset, p_limit;
  return jsonb_build_object('rows',result,'total',total,'revision',revision);
end;
$$;

create or replace function public.account_photo_page(p_user_id uuid, p_offset int, p_limit int)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare result jsonb; total bigint; revision text;
begin
  if p_user_id is null or p_offset is null or p_limit is null or p_offset < 0 or p_limit < 1 or p_limit > 500 then raise exception 'Invalid photo export request'; end if;
  select count(*), md5(coalesce(string_agg(md5(to_jsonb(o)::text),'' order by name),''))
    into total,revision from storage.objects o
    where bucket_id='recipe-photos' and split_part(name,'/',1)=p_user_id::text;
  select coalesce(jsonb_agg(row),'[]'::jsonb) into result from (
    select jsonb_build_object('name',name,'metadata',metadata,'created_at',created_at,'updated_at',updated_at) as row
    from storage.objects where bucket_id='recipe-photos' and split_part(name,'/',1)=p_user_id::text
    order by name offset p_offset limit p_limit
  ) s;
  return jsonb_build_object('rows',result,'total',total,'revision',revision);
end;
$$;

-- RESTRICT exercise FKs must not interrupt the multi-table auth-user cascade.
-- Child deletion occurs in the SAME transaction as auth deletion, so failure rolls it back.
create or replace function public.account_before_auth_delete()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if exists(select 1 from storage.objects where bucket_id='recipe-photos' and split_part(name,'/',1)=old.id::text) then
    raise exception 'Remove account storage objects before deleting the auth user';
  end if;
  delete from public.workout_exercises where user_id=old.id;
  delete from public.routine_exercises where user_id=old.id;
  return old;
end;
$$;
drop trigger if exists account_before_auth_delete on auth.users;
create trigger account_before_auth_delete before delete on auth.users
for each row execute function public.account_before_auth_delete();

-- Serialize photo writes against auth deletion; a still-valid old JWT cannot create orphan photos.
create or replace function public.account_photo_owner_guard()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare owner_id uuid;
begin
  if new.bucket_id <> 'recipe-photos' then return new; end if;
  begin owner_id := split_part(new.name,'/',1)::uuid;
  exception when invalid_text_representation then raise exception 'Invalid recipe photo owner'; end;
  perform 1 from auth.users where id=owner_id for key share;
  if not found then raise exception 'Recipe photo account no longer exists'; end if;
  return new;
end;
$$;
drop trigger if exists account_photo_owner_guard on storage.objects;
create trigger account_photo_owner_guard before insert or update on storage.objects
for each row execute function public.account_photo_owner_guard();

revoke all on function public.account_export_tables() from public,anon,authenticated;
revoke all on function public.account_export_page(uuid,text,int,int) from public,anon,authenticated;
revoke all on function public.account_photo_page(uuid,int,int) from public,anon,authenticated;
revoke all on function public.account_before_auth_delete() from public,anon,authenticated;
revoke all on function public.account_photo_owner_guard() from public,anon,authenticated;
grant execute on function public.account_export_tables() to service_role;
grant execute on function public.account_export_page(uuid,text,int,int) to service_role;
grant execute on function public.account_photo_page(uuid,int,int) to service_role;
notify pgrst, 'reload schema';
commit;
