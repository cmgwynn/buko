-- Curated recipes are human-approved versions, never automatically promoted library imports.
-- Membership is provisioned only by the database owner: insert into recipe_admins(user_id) values (...).
begin;

create table public.recipe_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
create table public.recipe_bases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.recipe_versions (
  id uuid primary key default gen_random_uuid(),
  base_recipe_id uuid not null references public.recipe_bases(id),
  user_id uuid references auth.users(id) on delete set null,
  version int not null check (version > 0),
  status text not null default 'draft' check (status in ('draft','tested','approved')),
  recipe jsonb not null,
  adaptation_policy jsonb not null,
  source_notes text not null default '' check (length(source_notes) <= 4000),
  created_at timestamptz not null default now(),
  unique(base_recipe_id,version)
);
create table public.recipe_quality_tests (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.recipe_versions(id),
  user_id uuid references auth.users(id) on delete set null,
  rating int not null check (rating between 1 and 5),
  would_make_again boolean not null,
  actual_minutes int not null check (actual_minutes between 0 and 1440),
  notes text not null check (length(notes) <= 4000),
  created_at timestamptz not null default now()
);
create table public.recipe_adaptations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recipe_id uuid not null unique references public.recipes(id) on delete cascade,
  base_recipe_id uuid references public.recipe_bases(id),
  base_recipe_version_id uuid references public.recipe_versions(id),
  request_id uuid not null,
  disposition text not null check (disposition in ('tested','adapted','fallback')),
  snapshot jsonb not null,
  attempts jsonb not null check (jsonb_typeof(attempts) = 'array' and jsonb_array_length(attempts) <= 10),
  review_note text not null check (length(review_note) <= 4000),
  changes jsonb not null check (jsonb_typeof(changes) = 'array' and jsonb_array_length(changes) <= 100),
  prompt_version text not null check (length(prompt_version) between 1 and 100),
  created_at timestamptz not null default now(),
  unique(user_id,request_id)
);
alter table public.recipes
  add column cuisine text,
  add column meal_types text[] not null default '{}',
  add column diet_tags text[] not null default '{}',
  add column base_recipe_version_id uuid references public.recipe_versions(id),
  add column recipe_adaptation_id uuid references public.recipe_adaptations(id) on delete set null,
  add column quality_fingerprint text;
create table public.recipe_taste_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preferences jsonb not null default '{}',
  learned_since timestamptz not null default '-infinity',
  updated_at timestamptz not null default now()
);
create table public.recipe_taste_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null,
  recipe_id uuid references public.recipes(id) on delete set null,
  base_recipe_version_id uuid references public.recipe_versions(id),
  disposition text not null check (disposition in ('tested','adapted','fallback','personal')),
  thumb boolean,
  make_again boolean,
  tags text[] not null,
  actual_minutes int check (actual_minutes between 0 and 1440),
  spice text check (spice in ('too mild','just right','too hot')),
  disliked text[] not null,
  created_at timestamptz not null default now(),
  unique(user_id,event_id)
);
create index recipe_taste_feedback_base_idx on public.recipe_taste_feedback(base_recipe_version_id,disposition,user_id);
create table public.recipe_quality_requests (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  kind text not null check (kind in ('adapt','review')),
  attempt int not null default 1 check (attempt between 1 and 2),
  created_at timestamptz not null default now(),
  primary key(user_id,request_id,kind,attempt)
);
create index recipe_quality_requests_day_idx on public.recipe_quality_requests(user_id,created_at);
create table public.recipe_quality_claims (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  leased_until timestamptz not null,
  primary key(user_id,request_id)
);

do $$
declare t text;
begin
  foreach t in array array['recipe_admins','recipe_bases','recipe_versions','recipe_quality_tests',
    'recipe_adaptations','recipe_taste_profiles','recipe_taste_feedback','recipe_quality_requests','recipe_quality_claims'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
  end loop;
end $$;

create function public.recipe_quality_is_admin()
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
  select auth.uid() is not null and exists(select 1 from public.recipe_admins where user_id=auth.uid());
$$;

-- Canonical snapshots have precisely the public recipe shape; provenance compares the entire value.
create function public.recipe_quality_snapshot(p_recipe jsonb, p_complete boolean default false)
returns jsonb language plpgsql immutable set search_path=pg_catalog,public as $$
declare x jsonb; key text; n numeric; ingredients jsonb := '[]'; steps jsonb := '[]';
begin
  if p_recipe is null or jsonb_typeof(p_recipe) <> 'object' or octet_length(p_recipe::text)>500000
    or not p_recipe ?& array['title','servings','prepMinutes','cookMinutes','cuisine','mealTypes','dietTags','ingredients','steps']
    or (select count(*) from jsonb_object_keys(p_recipe))<>9 then raise exception 'Invalid recipe snapshot'; end if;
  if jsonb_typeof(p_recipe->'title') <> 'string' or length(btrim(p_recipe->>'title')) not between 1 and 200
    or jsonb_typeof(p_recipe->'servings') <> 'number' or (p_recipe->>'servings')::numeric not between 0.01 and 100
    or jsonb_typeof(p_recipe->'cuisine') not in ('string','null')
    then raise exception 'Invalid recipe details'; end if;
  foreach key in array array['prepMinutes','cookMinutes'] loop
    if p_recipe->key <> 'null'::jsonb then
      if jsonb_typeof(p_recipe->key)<>'number' then raise exception 'Invalid recipe time'; end if;
      n := (p_recipe->>key)::numeric;
      if n<0 or n>1440 or n<>trunc(n) then raise exception 'Invalid recipe time'; end if;
      p_recipe := jsonb_set(p_recipe,array[key],to_jsonb(n::int));
    elsif p_complete then raise exception 'Complete recipe times before approval'; end if;
  end loop;
  foreach key in array array['mealTypes','dietTags','ingredients','steps'] loop
    if jsonb_typeof(p_recipe->key)<>'array' or jsonb_array_length(p_recipe->key)>100 then
      raise exception 'Invalid recipe array';
    end if;
  end loop;
  foreach key in array array['mealTypes','dietTags'] loop
    if exists(select 1 from jsonb_array_elements(p_recipe->key) a where jsonb_typeof(a)<>'string' or length(a#>>'{}') not between 1 and 80)
      then raise exception 'Invalid recipe tags'; end if;
  end loop;
  if p_complete and (nullif(btrim(p_recipe->>'cuisine'),'') is null or jsonb_array_length(p_recipe->'mealTypes')=0
    or jsonb_array_length(p_recipe->'ingredients')=0 or jsonb_array_length(p_recipe->'steps')=0)
    then raise exception 'Recipe is incomplete'; end if;
  for x in select value from jsonb_array_elements(p_recipe->'ingredients') loop
    if jsonb_typeof(x)<>'object'
      or not x ?& array['position','raw_text','quantity','unit','name','grams','food_source','food_source_id','nutrition','section','match_status']
      or (select count(*) from jsonb_object_keys(x))<>11
      or jsonb_typeof(x->'position')<>'number' or (x->>'position')::numeric<0
      or (x->>'position')::numeric<>trunc((x->>'position')::numeric)
      or jsonb_typeof(x->'name')<>'string' or length(btrim(x->>'name')) not between 1 and 500
      or jsonb_typeof(x->'raw_text')<>'string' or length(btrim(x->>'raw_text')) not between 1 and 2000
      or x->>'section' not in ('produce','dairy','meat','pantry','frozen','other')
      or x->>'match_status' not in ('matched','unmatched','manual')
      or jsonb_typeof(x->'section')<>'string' or jsonb_typeof(x->'match_status')<>'string'
      or jsonb_typeof(x->'nutrition') not in ('object','null')
      then raise exception 'Invalid recipe ingredient'; end if;
    foreach key in array array['quantity','grams'] loop
      if jsonb_typeof(x->key) not in ('number','null') then raise exception 'Invalid ingredient amount'; end if;
      if x->key<>'null'::jsonb and ((x->>key)::numeric<0 or (x->>key)::numeric>1000000)
        then raise exception 'Invalid ingredient amount'; end if;
    end loop;
    foreach key in array array['unit','food_source','food_source_id'] loop
      if jsonb_typeof(x->key) not in ('string','null') then raise exception 'Invalid ingredient source'; end if;
    end loop;
    if x->>'food_source' is not null and x->>'food_source' not in ('usda','off','manual')
      then raise exception 'Invalid ingredient source'; end if;
    if p_complete then
      if coalesce((x->>'quantity')::numeric,(x->>'grams')::numeric,0)<=0 or coalesce((x->>'grams')::numeric,0)<=0
        then raise exception 'Resolve ingredient quantities and weights before approval'; end if;
      if jsonb_typeof(x->'nutrition'->'per100g') is distinct from 'object'
        then raise exception 'Resolve ingredient nutrition before approval'; end if;
      foreach key in array array['calories','protein','carbs','fat','sugars','saturatedFat','sodiumMg','fiber'] loop
        if jsonb_typeof(x->'nutrition'->'per100g'->key) is distinct from 'number'
          then raise exception 'Resolve ingredient nutrition before approval'; end if;
        if (x->'nutrition'->'per100g'->>key)::numeric<0 then raise exception 'Invalid ingredient nutrition'; end if;
      end loop;
    end if;
    ingredients := ingredients || jsonb_build_array(jsonb_set(x,'{position}',to_jsonb((x->>'position')::numeric::int)));
  end loop;
  for x in select value from jsonb_array_elements(p_recipe->'steps') loop
    if jsonb_typeof(x)<>'object' or not x ?& array['position','text','timer_seconds']
      or (select count(*) from jsonb_object_keys(x))<>3 or jsonb_typeof(x->'position')<>'number'
      or (x->>'position')::numeric<0 or (x->>'position')::numeric<>trunc((x->>'position')::numeric)
      or jsonb_typeof(x->'text')<>'string' or length(btrim(x->>'text')) not between 1 and 10000
      or jsonb_typeof(x->'timer_seconds') not in ('number','null')
      then raise exception 'Invalid recipe step'; end if;
    if x->'timer_seconds'<>'null'::jsonb and ((x->>'timer_seconds')::numeric not between 1 and 86400
      or (x->>'timer_seconds')::numeric<>trunc((x->>'timer_seconds')::numeric))
      then raise exception 'Invalid recipe timer'; end if;
    if x->'timer_seconds'<>'null'::jsonb then
      x := jsonb_set(x,'{timer_seconds}',to_jsonb((x->>'timer_seconds')::numeric::int));
    end if;
    steps := steps || jsonb_build_array(jsonb_set(x,'{position}',to_jsonb((x->>'position')::numeric::int)));
  end loop;
  foreach key in array array['ingredients','steps'] loop
    if exists(select 1 from jsonb_array_elements(p_recipe->key) with ordinality a(value,n)
      where (a.value->>'position')::numeric<>a.n-1) then raise exception 'Recipe positions must be consecutive'; end if;
  end loop;
  return p_recipe || jsonb_build_object('ingredients',ingredients,'steps',steps);
end $$;

create function public.recipe_quality_policy(p_policy jsonb)
returns jsonb language plpgsql immutable set search_path=pg_catalog,public as $$
declare result jsonb; k text;
begin
  if p_policy is null or jsonb_typeof(p_policy)<>'object' or octet_length(p_policy::text)>10000
    or p_policy - array['allowedProteinSwaps','allowedDietarySwaps','maxSubstitutions'] <> '{}'::jsonb
    then raise exception 'Invalid adaptation policy'; end if;
  result := '{"allowedProteinSwaps":[],"allowedDietarySwaps":[],"maxSubstitutions":2}'::jsonb || p_policy;
  foreach k in array array['allowedProteinSwaps','allowedDietarySwaps'] loop
    if jsonb_typeof(result->k)<>'array' or jsonb_array_length(result->k)>20
      or exists(select 1 from jsonb_array_elements(result->k) x where jsonb_typeof(x)<>'string' or length(x#>>'{}') not between 1 and 100)
      then raise exception 'Invalid adaptation policy swaps'; end if;
  end loop;
  if jsonb_typeof(result->'maxSubstitutions')<>'number' or (result->>'maxSubstitutions')::numeric not between 0 and 2
    or (result->>'maxSubstitutions')::numeric<>trunc((result->>'maxSubstitutions')::numeric)
    then raise exception 'Adaptation policy allows at most two substitutions'; end if;
  return result;
end $$;

create function public.recipe_quality_rows(p_approved boolean)
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'base_recipe_id',v.base_recipe_id,
    'version',v.version,'status',v.status,'recipe',v.recipe,'adaptation_policy',v.adaptation_policy,
    'source_notes',case when p_approved then '' else v.source_notes end,
    'tests',case when p_approved then '[]'::jsonb else
      (select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'rating',t.rating,'would_make_again',t.would_make_again,
        'actual_minutes',t.actual_minutes,'notes',t.notes,'created_at',t.created_at) order by t.created_at,t.id),'[]'::jsonb)
       from public.recipe_quality_tests t where t.version_id=v.id) end,
    'created_at',v.created_at,'archived_at',b.archived_at) order by v.base_recipe_id,v.version),'[]'::jsonb)
  from public.recipe_versions v join public.recipe_bases b on b.id=v.base_recipe_id
  where not p_approved or (v.status='approved' and b.archived_at is null);
$$;
create function public.recipe_quality_admin_list()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
  if not public.recipe_quality_is_admin() then raise exception 'Recipe admin required'; end if;
  return public.recipe_quality_rows(false);
end $$;
create function public.recipe_quality_approved()
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
  select public.recipe_quality_rows(true);
$$;

create function public.recipe_quality_create_draft(p_recipe jsonb,p_base_id uuid default null,
  p_policy jsonb default '{}',p_source_notes text default '')
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare base uuid := p_base_id; result uuid; next_version int;
begin
  if not public.recipe_quality_is_admin() then raise exception 'Recipe admin required'; end if;
  p_recipe := public.recipe_quality_snapshot(p_recipe);
  if p_source_notes is null or length(p_source_notes)>4000 then raise exception 'Invalid source permission notes'; end if;
  if base is null then
    insert into public.recipe_bases(user_id) values(auth.uid()) returning id into base;
  else
    perform 1 from public.recipe_bases where id=base for update;
    if not found then raise exception 'Base recipe unavailable'; end if;
  end if;
  select coalesce(max(version),0)+1 into next_version from public.recipe_versions where base_recipe_id=base;
  insert into public.recipe_versions(base_recipe_id,user_id,version,recipe,adaptation_policy,source_notes)
    values(base,auth.uid(),next_version,p_recipe,public.recipe_quality_policy(p_policy),btrim(p_source_notes)) returning id into result;
  return result;
end $$;
create function public.recipe_quality_archive(p_base_id uuid,p_archived boolean)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if not public.recipe_quality_is_admin() then raise exception 'Recipe admin required'; end if;
  if p_archived is null then raise exception 'Choose pause or resume'; end if;
  update public.recipe_bases set archived_at=case when p_archived then now() end where id=p_base_id;
  if not found then raise exception 'Base recipe unavailable'; end if;
end $$;
create function public.recipe_quality_record_test(p_version_id uuid,p_rating int,p_would_make_again bool,p_actual_minutes int,p_notes text)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if not public.recipe_quality_is_admin() then raise exception 'Recipe admin required'; end if;
  perform 1 from public.recipe_versions where id=p_version_id and status<>'approved' for update;
  if not found then raise exception 'Create a new version to test an approved recipe'; end if;
  insert into public.recipe_quality_tests(version_id,user_id,rating,would_make_again,actual_minutes,notes)
    values(p_version_id,auth.uid(),p_rating,p_would_make_again,p_actual_minutes,p_notes);
  update public.recipe_versions set status='tested' where id=p_version_id;
end $$;
create function public.recipe_quality_approve(p_version_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare v public.recipe_versions;
begin
  if not public.recipe_quality_is_admin() then raise exception 'Recipe admin required'; end if;
  select * into v from public.recipe_versions where id=p_version_id for update;
  if not found then raise exception 'Recipe version unavailable'; end if;
  if v.status='approved' then return; end if;
  if v.status<>'tested' or not exists(select 1 from public.recipe_quality_tests where version_id=v.id and rating>=4 and would_make_again)
    then raise exception 'Approval requires a positive human cooking test'; end if;
  if length(btrim(v.source_notes))<10 then raise exception 'Record source permission notes before approval'; end if;
  perform public.recipe_quality_snapshot(v.recipe,true);
  perform public.recipe_quality_policy(v.adaptation_policy);
  update public.recipe_versions set status='approved' where id=v.id;
end $$;

-- Defense in depth for accidental privileged edits: content and policies always require a new version.
create function public.recipe_quality_immutable_version()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
  if row(new.id,new.base_recipe_id,new.version,new.recipe,new.adaptation_policy,new.source_notes,new.created_at)
    is distinct from row(old.id,old.base_recipe_id,old.version,old.recipe,old.adaptation_policy,old.source_notes,old.created_at)
    or (old.status='approved' and new.status<>'approved') then raise exception 'Recipe versions are immutable'; end if;
  if old.status is distinct from new.status then
    if old.status='draft' and new.status='tested' then
      if not exists(select 1 from public.recipe_quality_tests where version_id=old.id)
        then raise exception 'A human cooking test is required'; end if;
    elsif old.status='tested' and new.status='approved' then
      if not exists(select 1 from public.recipe_quality_tests where version_id=old.id and rating>=4 and would_make_again)
        then raise exception 'Approval requires a positive human cooking test'; end if;
      if length(btrim(new.source_notes))<10 then raise exception 'Record source permission notes before approval'; end if;
      perform public.recipe_quality_snapshot(new.recipe,true);
      perform public.recipe_quality_policy(new.adaptation_policy);
    else raise exception 'Invalid recipe quality status transition';
    end if;
  end if;
  return new;
end $$;
create trigger recipe_quality_immutable_version before update on public.recipe_versions
for each row execute function public.recipe_quality_immutable_version();

create function public.recipe_quality_private_snapshot(p_recipe_id uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
  select jsonb_build_object('title',r.title,'servings',r.servings,'prepMinutes',r.prep_minutes,'cookMinutes',r.cook_minutes,
    'cuisine',r.cuisine,'mealTypes',to_jsonb(r.meal_types),'dietTags',to_jsonb(r.diet_tags),
    'ingredients',(select coalesce(jsonb_agg(jsonb_build_object('position',i.position,'raw_text',i.raw_text,'quantity',i.quantity,
      'unit',i.unit,'name',i.name,'grams',i.grams,'food_source',i.food_source,'food_source_id',i.food_source_id,
      'nutrition',i.nutrition,'section',i.section,'match_status',i.match_status) order by i.position,i.id),'[]'::jsonb)
      from public.recipe_ingredients i where i.recipe_id=r.id),
    'steps',(select coalesce(jsonb_agg(jsonb_build_object('position',s.position,'text',s.text,'timer_seconds',s.timer_seconds)
      order by s.position,s.id),'[]'::jsonb) from public.recipe_steps s where s.recipe_id=r.id))
  from public.recipes r where r.id=p_recipe_id;
$$;
create function public.recipe_quality_provenance(p_recipe_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare r public.recipes; a public.recipe_adaptations; v public.recipe_versions; snapshot jsonb;
begin
  select * into r from public.recipes where id=p_recipe_id and user_id=auth.uid();
  if not found then raise exception 'Recipe unavailable'; end if;
  select * into a from public.recipe_adaptations where id=r.recipe_adaptation_id and recipe_id=r.id and user_id=r.user_id;
  select * into v from public.recipe_versions where id=a.base_recipe_version_id and status='approved';
  snapshot := public.recipe_quality_private_snapshot(r.id);
  if a.id is null or v.id is null or a.disposition='fallback' or r.base_recipe_version_id is distinct from v.id
    or snapshot is distinct from a.snapshot or r.quality_fingerprint is distinct from md5(snapshot::text)
    or (a.disposition='tested' and snapshot is distinct from v.recipe)
    then return jsonb_build_object('label',null,'baseTitle',null,'note',null); end if;
  return jsonb_build_object('label',case when a.disposition='tested' then 'Tested' else 'Adapted' end,
    'baseTitle',v.recipe->>'title','note',a.review_note);
end $$;

-- Existing recipe save RPCs never accept provenance fields. Direct client writes cannot mint them either.
create function public.recipe_quality_protect_label()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
  if current_user in ('anon','authenticated') then
    if tg_op='INSERT' then
      if new.base_recipe_version_id is not null or new.recipe_adaptation_id is not null or new.quality_fingerprint is not null
        then raise exception 'Recipe provenance is server managed'; end if;
    elsif row(new.base_recipe_version_id,new.recipe_adaptation_id,new.quality_fingerprint)
      is distinct from row(old.base_recipe_version_id,old.recipe_adaptation_id,old.quality_fingerprint)
      then raise exception 'Recipe provenance is server managed'; end if;
  end if;
  return new;
end $$;
create trigger recipe_quality_protect_label before insert or update on public.recipes
for each row execute function public.recipe_quality_protect_label();

create function public.recipe_quality_publish(p_user_id uuid,p_result jsonb,p_request_id uuid)
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare v public.recipe_versions; result uuid; adaptation uuid; snap jsonb; disposition text; a jsonb; issue jsonb;
begin
  if p_user_id is null or p_request_id is null then raise exception 'Invalid recipe publication owner or request'; end if;
  perform 1 from auth.users where id=p_user_id for key share;
  if not found then raise exception 'Recipe account unavailable'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||p_request_id::text,0));
  select recipe_id into result from public.recipe_adaptations where user_id=p_user_id and request_id=p_request_id;
  if found then return result; end if;
  if p_result is null or jsonb_typeof(p_result)<>'object' or octet_length(p_result::text)>600000
    or not p_result ?& array['baseVersionId','recipe','disposition','attempts','reviewNote','changes','promptVersion']
    or p_result - array['baseVersionId','recipe','disposition','attempts','reviewNote','changes','promptVersion'] <> '{}'::jsonb
    then raise exception 'Invalid quality publication'; end if;
  disposition := p_result->>'disposition';
  if disposition is null or disposition not in ('tested','adapted','fallback') then raise exception 'Invalid quality disposition'; end if;
  snap := public.recipe_quality_snapshot(p_result->'recipe',true);
  select rv.* into v from public.recipe_versions rv join public.recipe_bases b on b.id=rv.base_recipe_id
    where rv.id=(p_result->>'baseVersionId')::uuid and rv.status='approved' and b.archived_at is null for share of rv,b;
  if disposition<>'fallback' and v.id is null then raise exception 'An approved base version is required'; end if;
  if p_result->>'baseVersionId' is not null and v.id is null then raise exception 'Base version is not approved'; end if;
  if disposition='tested' and snap is distinct from v.recipe then raise exception 'Tested recipes must exactly match the approved version'; end if;
  -- Audit data is structured outcomes only: unknown/free-form hidden reasoning is rejected.
  if jsonb_typeof(p_result->'attempts')<>'array' or jsonb_array_length(p_result->'attempts')>10
    or exists(select 1 from jsonb_array_elements(p_result->'attempts') q(value)
      where jsonb_typeof(q.value)<>'object' or q.value - array['attempt','stage','outcome','issues','model','promptVersion']<>'{}'::jsonb)
    then raise exception 'Invalid review attempts'; end if;
  for a in select value from jsonb_array_elements(p_result->'attempts') loop
    if not a ?& array['attempt','stage','outcome','issues','promptVersion']
      or a->'attempt' not in ('1'::jsonb,'2'::jsonb)
      or a->>'stage' not in ('adapt','review') or jsonb_typeof(a->'stage')<>'string'
      or a->>'outcome' not in ('accepted','rejected','invalid','unavailable') or jsonb_typeof(a->'outcome')<>'string'
      or jsonb_typeof(a->'promptVersion')<>'string' or length(a->>'promptVersion') not between 1 and 100
      or jsonb_typeof(a->'issues')<>'array' or jsonb_array_length(a->'issues')>100
      or (a ? 'model' and (jsonb_typeof(a->'model')<>'string' or length(a->>'model')>100))
      then raise exception 'Invalid review attempt outcome'; end if;
    for issue in select value from jsonb_array_elements(a->'issues') loop
      if jsonb_typeof(issue)<>'object' or not issue ?& array['category','severity','detail']
        or issue - array['category','severity','detail']<>'{}'::jsonb
        or issue->>'category' not in ('balance','aromatics','texture','seasoning','technique','compatibility','practicality','restriction','scope')
        or jsonb_typeof(issue->'category')<>'string'
        or issue->>'severity' not in ('warning','blocking') or jsonb_typeof(issue->'severity')<>'string'
        or jsonb_typeof(issue->'detail')<>'string' or length(issue->>'detail')>1000
        then raise exception 'Invalid review issue'; end if;
    end loop;
  end loop;
  if jsonb_typeof(p_result->'changes')<>'array' or jsonb_array_length(p_result->'changes')>100
    or jsonb_typeof(p_result->'reviewNote')<>'string' or length(p_result->>'reviewNote')>4000
    or jsonb_typeof(p_result->'promptVersion')<>'string' then raise exception 'Invalid quality review metadata'; end if;
  for a in select value from jsonb_array_elements(p_result->'changes') loop
    if jsonb_typeof(a)<>'object' or not a ?& array['path','reason'] or a - array['path','reason']<>'{}'::jsonb
      or jsonb_typeof(a->'path')<>'string' or length(a->>'path') not between 1 and 200
      or jsonb_typeof(a->'reason')<>'string' or length(a->>'reason') not between 1 and 1000
      then raise exception 'Invalid quality change summary'; end if;
  end loop;
  insert into public.recipes(user_id,title,servings,prep_minutes,cook_minutes,cuisine,meal_types,diet_tags)
    values(p_user_id,snap->>'title',(snap->>'servings')::numeric,(snap->>'prepMinutes')::int,(snap->>'cookMinutes')::int,
      snap->>'cuisine',array(select jsonb_array_elements_text(snap->'mealTypes')),array(select jsonb_array_elements_text(snap->'dietTags')))
    returning id into result;
  insert into public.recipe_ingredients(recipe_id,user_id,position,raw_text,quantity,unit,name,grams,food_source,food_source_id,nutrition,section,match_status)
    select result,p_user_id,x.position,x.raw_text,x.quantity,x.unit,x.name,x.grams,x.food_source,x.food_source_id,x.nutrition,x.section,x.match_status
    from jsonb_to_recordset(snap->'ingredients') as x(position int,raw_text text,quantity numeric,unit text,name text,grams numeric,
      food_source text,food_source_id text,nutrition jsonb,section text,match_status text);
  insert into public.recipe_steps(recipe_id,user_id,position,text,timer_seconds)
    select result,p_user_id,x.position,x.text,x.timer_seconds from jsonb_to_recordset(snap->'steps') as x(position int,text text,timer_seconds int);
  snap := public.recipe_quality_private_snapshot(result);
  insert into public.recipe_adaptations(user_id,recipe_id,base_recipe_id,base_recipe_version_id,request_id,disposition,snapshot,attempts,review_note,changes,prompt_version)
    values(p_user_id,result,v.base_recipe_id,v.id,p_request_id,disposition,snap,p_result->'attempts',p_result->>'reviewNote',
      p_result->'changes',p_result->>'promptVersion') returning id into adaptation;
  update public.recipes set base_recipe_version_id=v.id,recipe_adaptation_id=adaptation,
    quality_fingerprint=case when disposition<>'fallback' then md5(snap::text) end where id=result;
  return result;
end $$;

create function public.recipe_quality_taste_profile()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare preferences jsonb; updated timestamptz; learned jsonb; since timestamptz;
begin
  if auth.uid() is null then raise exception 'Sign in to view taste preferences'; end if;
  select p.preferences,p.updated_at,p.learned_since into preferences,updated,since from public.recipe_taste_profiles p where user_id=auth.uid();
  since := coalesce(since,'-infinity'::timestamptz);
  select jsonb_build_object('feedbackCount',count(*),'ratedMeals',count(*),'thumbsUp',count(*) filter(where thumb),
    'thumbsDown',count(*) filter(where not thumb),'makeAgainCount',count(*) filter(where make_again),
    'preferredCuisines',coalesce((select jsonb_agg(cuisine order by n desc,cuisine) from (
      select r.cuisine,count(*) n from public.recipe_taste_feedback f join public.recipes r on r.id=f.recipe_id
      where f.user_id=auth.uid() and f.created_at>=since and f.thumb and r.cuisine is not null
      group by r.cuisine limit 10) cuisines),'[]'::jsonb),
    'spiceFeedback',jsonb_build_object('tooHot',count(*) filter(where spice='too hot'),
      'tooMild',count(*) filter(where spice='too mild'),'justRight',count(*) filter(where spice='just right')),
    'typicalCookingMinutes',round(avg(actual_minutes)),
    'dislikedIngredients',coalesce((select jsonb_agg(ingredient order by n desc,ingredient) from (
      select ingredient,count(*) n from public.recipe_taste_feedback f cross join lateral unnest(f.disliked) ingredient
      where f.user_id=auth.uid() and f.created_at>=since group by ingredient limit 30) dislikes),'[]'::jsonb),
    'tagCounts',coalesce((select jsonb_object_agg(tag,n) from (
      select tag,count(*) n from public.recipe_taste_feedback f cross join lateral unnest(f.tags) tag
      where f.user_id=auth.uid() and f.created_at>=since group by tag) counts),'{}'::jsonb),
    'dislikedCounts',coalesce((select jsonb_object_agg(ingredient,n) from (
      select ingredient,count(*) n from public.recipe_taste_feedback f cross join lateral unnest(f.disliked) ingredient
      where f.user_id=auth.uid() and f.created_at>=since group by ingredient) counts),'{}'::jsonb))
    into learned from public.recipe_taste_feedback where user_id=auth.uid() and created_at>=since;
  return jsonb_build_object('preferences',
    '{"preferredCuisines":[],"spiceTolerance":"medium","dislikedIngredients":[],"maxCookMinutes":null,"aiConsentVersion":null}'::jsonb
      || coalesce(preferences,'{}'::jsonb),'learned',learned,'updated_at',updated);
end $$;
create function public.recipe_quality_result(p_request_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
  if auth.uid() is null then raise exception 'Sign in to view a recipe suggestion'; end if;
  return (select jsonb_build_object('recipeId',a.recipe_id,'disposition',a.disposition,'note',a.review_note)
    from public.recipe_adaptations a join public.recipes r on r.id=a.recipe_id and r.user_id=a.user_id
    where a.user_id=auth.uid() and a.request_id=p_request_id);
end $$;
create function public.recipe_quality_claim(p_user_id uuid,p_request_id uuid)
returns boolean language plpgsql security definer set search_path=pg_catalog,public as $$
declare me uuid := p_user_id; lease timestamptz;
begin
  if me is null then raise exception 'Sign in to request a recipe suggestion'; end if;
  if p_request_id is null then raise exception 'A recipe request ID is required'; end if;
  perform 1 from auth.users where id=me for key share;
  if not found then raise exception 'Recipe account unavailable'; end if;
  -- Publication takes the same transaction lock; a completed save always wins over a new lease.
  perform pg_advisory_xact_lock(hashtextextended(me::text||p_request_id::text,0));
  if exists(select 1 from public.recipe_adaptations a join public.recipes r on r.id=a.recipe_id and r.user_id=me
    where a.user_id=me and a.request_id=p_request_id) then return false; end if;
  select leased_until into lease from public.recipe_quality_claims where user_id=me and request_id=p_request_id;
  if lease>clock_timestamp() then return false; end if;
  insert into public.recipe_quality_claims(user_id,request_id,leased_until)
    values(me,p_request_id,clock_timestamp()+interval '180 seconds')
    on conflict(user_id,request_id) do update set leased_until=excluded.leased_until;
  return true;
end $$;
create function public.recipe_quality_reset_taste_learning()
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if auth.uid() is null then raise exception 'Sign in to reset taste learning'; end if;
  insert into public.recipe_taste_profiles(user_id,learned_since) values(auth.uid(),clock_timestamp())
    on conflict(user_id) do update set learned_since=excluded.learned_since,updated_at=now();
end $$;
create function public.recipe_quality_save_taste_profile(p_preferences jsonb)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare k text;
begin
  if auth.uid() is null then raise exception 'Sign in to save taste preferences'; end if;
  if p_preferences is null or jsonb_typeof(p_preferences)<>'object' or octet_length(p_preferences::text)>16000
    or p_preferences - array['preferredCuisines','spiceTolerance','dislikedIngredients','maxCookMinutes','aiConsentVersion']<>'{}'::jsonb
    or (p_preferences ? 'aiConsentVersion' and p_preferences->'aiConsentVersion'<>'null'::jsonb
      and p_preferences->>'aiConsentVersion'<>'recipe-quality-v1') then raise exception 'Invalid taste preferences or recipe AI consent'; end if;
  foreach k in array array['preferredCuisines','dislikedIngredients'] loop
    if p_preferences ? k then
      if jsonb_typeof(p_preferences->k)<>'array' or jsonb_array_length(p_preferences->k)>30
        or exists(select 1 from jsonb_array_elements(p_preferences->k) x where jsonb_typeof(x)<>'string' or length(btrim(x#>>'{}')) not between 1 and 100)
        then raise exception 'Invalid taste preference list'; end if;
    end if;
  end loop;
  if p_preferences ? 'spiceTolerance' and (jsonb_typeof(p_preferences->'spiceTolerance')<>'string'
    or p_preferences->>'spiceTolerance' not in ('mild','medium','hot')) then raise exception 'Invalid spice tolerance'; end if;
  if p_preferences ? 'maxCookMinutes' and p_preferences->'maxCookMinutes'<>'null'::jsonb then
    if jsonb_typeof(p_preferences->'maxCookMinutes')<>'number' or (p_preferences->>'maxCookMinutes')::numeric not between 1 and 1440
      or (p_preferences->>'maxCookMinutes')::numeric<>trunc((p_preferences->>'maxCookMinutes')::numeric)
      then raise exception 'Invalid maximum cook time'; end if;
  end if;
  insert into public.recipe_taste_profiles(user_id,preferences) values(auth.uid(),p_preferences)
    on conflict(user_id) do update set preferences=excluded.preferences,updated_at=now();
end $$;
create function public.recipe_quality_reserve(p_user_id uuid,p_request_id uuid,p_global_limit integer,
  p_kind text default 'adapt',p_attempt integer default 1)
returns boolean language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if p_user_id is null or p_request_id is null or p_kind is null or p_kind not in ('adapt','review')
    or p_attempt is null or p_attempt not between 1 and 2 or p_global_limit is null or p_global_limit not between 1 and 10000
    then raise exception 'Invalid recipe quality reservation'; end if;
  -- All reservations share this lock: concurrent owners cannot overrun the shared server budget.
  perform pg_advisory_xact_lock(hashtextextended('recipe-quality-global-budget',0));
  if not exists(select 1 from public.recipe_taste_profiles where user_id=p_user_id and preferences->>'aiConsentVersion'='recipe-quality-v1')
    then raise exception 'Recipe AI consent required'; end if;
  if exists(select 1 from public.recipe_quality_requests where user_id=p_user_id and request_id=p_request_id and kind=p_kind and attempt=p_attempt)
    or (select count(*) from public.recipe_quality_requests where user_id=p_user_id and created_at>now()-interval '1 minute')>=5
    or (select count(*) from public.recipe_quality_requests where user_id=p_user_id and created_at>now()-interval '1 day')>=20
    or (select count(*) from public.recipe_quality_requests where created_at>now()-interval '1 day')>=p_global_limit
    then return false; end if;
  insert into public.recipe_quality_requests(user_id,request_id,kind,attempt) values(p_user_id,p_request_id,p_kind,p_attempt);
  return true;
end $$;

create function public.recipe_quality_feedback(p_recipe_id uuid,p_event_id uuid,p_thumb boolean,p_make_again boolean,
  p_tags text[],p_actual_minutes int default null,p_spice text default null,p_disliked text[] default '{}')
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare r public.recipes; a public.recipe_adaptations; label text;
begin
  if auth.uid() is null then raise exception 'Sign in to rate recipes'; end if;
  select * into r from public.recipes where id=p_recipe_id and user_id=auth.uid() for share;
  if not found then raise exception 'Recipe unavailable'; end if;
  if p_event_id is null or p_tags is null or p_disliked is null or cardinality(p_tags)>20 or cardinality(p_disliked)>30
    or exists(select 1 from unnest(p_tags||p_disliked) t where t is null or length(btrim(t)) not between 1 and 100)
    then raise exception 'Invalid taste feedback'; end if;
  if exists(select 1 from public.recipe_taste_feedback where user_id=auth.uid() and event_id=p_event_id) then return; end if;
  label := public.recipe_quality_provenance(r.id)->>'label';
  select * into a from public.recipe_adaptations where id=r.recipe_adaptation_id and user_id=r.user_id and recipe_id=r.id;
  insert into public.recipe_taste_feedback(user_id,event_id,recipe_id,base_recipe_version_id,disposition,thumb,make_again,tags,actual_minutes,spice,disliked)
    values(auth.uid(),p_event_id,r.id,case when label is not null then a.base_recipe_version_id end,
      case label when 'Tested' then 'tested' when 'Adapted' then 'adapted' else 'personal' end,
      p_thumb,p_make_again,p_tags,p_actual_minutes,p_spice,p_disliked)
    on conflict(user_id,event_id) do nothing;
end $$;
create function public.recipe_quality_flags()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
  if not public.recipe_quality_is_admin() then raise exception 'Recipe admin required'; end if;
  -- One latest vote per distinct person/version/disposition, not one vote per saved copy or event.
  return (with latest as (
    select distinct on (base_recipe_version_id,disposition,user_id) base_recipe_version_id,disposition,user_id,thumb
    from public.recipe_taste_feedback where base_recipe_version_id is not null and disposition in ('tested','adapted') and thumb is not null
    order by base_recipe_version_id,disposition,user_id,created_at desc,id desc
  ), totals as (
    select base_recipe_version_id,disposition,count(*) as users,count(*) filter(where not thumb) as down
    from latest group by base_recipe_version_id,disposition having count(*)>=10
  ) select coalesce(jsonb_agg(jsonb_build_object('base_recipe_id',v.base_recipe_id,'version_id',t.base_recipe_version_id,
    'title',v.recipe->>'title','disposition',t.disposition,'distinct_users',t.users,'thumbs_down',t.down,
    'thumbs_down_rate',t.down::numeric/t.users,'flagged',true)
    order by t.base_recipe_version_id,t.disposition),'[]'::jsonb)
    from totals t join public.recipe_versions v on v.id=t.base_recipe_version_id where t.down::numeric/t.users>=0.4);
end $$;

-- Explicit ACLs also cover helpers/trigger functions; PostgreSQL otherwise grants PUBLIC execution.
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'recipe_quality_%' loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
  end loop;
end $$;
grant execute on function public.recipe_quality_is_admin(),public.recipe_quality_admin_list(),
  public.recipe_quality_approved(),public.recipe_quality_create_draft(jsonb,uuid,jsonb,text),
  public.recipe_quality_record_test(uuid,int,bool,int,text),public.recipe_quality_approve(uuid),
  public.recipe_quality_archive(uuid,boolean),
  public.recipe_quality_provenance(uuid),public.recipe_quality_feedback(uuid,uuid,bool,bool,text[],int,text,text[]),
  public.recipe_quality_result(uuid),
  public.recipe_quality_taste_profile(),public.recipe_quality_save_taste_profile(jsonb),
  public.recipe_quality_reset_taste_learning(),public.recipe_quality_flags() to authenticated;
grant execute on function public.recipe_quality_approved(),public.recipe_quality_taste_profile(),
  public.recipe_quality_result(uuid),public.recipe_quality_claim(uuid,uuid),
  public.recipe_quality_publish(uuid,jsonb,uuid),public.recipe_quality_reserve(uuid,uuid,integer,text,integer) to service_role;
notify pgrst,'reload schema';
commit;
