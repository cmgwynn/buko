-- Transactional replacements: failed saves never erase an existing recipe or grocery list.
begin;
create function public.save_private_recipe(p_recipe jsonb, p_ingredients jsonb, p_steps jsonb)
returns uuid language plpgsql security invoker set search_path = pg_catalog, public as $$
declare
  owner uuid := auth.uid();
  v_recipe_id uuid := nullif(p_recipe->>'id','')::uuid;
begin
  if owner is null then raise exception 'Sign in to save recipes'; end if;
  if p_recipe->>'expected_user_id' is distinct from owner::text then raise exception 'Your account changed. Recipe was not saved'; end if;
  if jsonb_typeof(p_recipe) is distinct from 'object'
    or jsonb_typeof(p_ingredients) is distinct from 'array'
    or jsonb_typeof(p_steps) is distinct from 'array'
    or jsonb_array_length(p_ingredients)>100 or jsonb_array_length(p_steps)>100
    or octet_length(p_recipe::text || p_ingredients::text || p_steps::text)>500000
    then raise exception 'Invalid recipe data'; end if;
  if v_recipe_id is not null then
    perform 1 from public.recipes where id=v_recipe_id and user_id=owner for update;
    if not found then raise exception 'Recipe unavailable'; end if;
    update public.recipes set title=btrim(p_recipe->>'title'), servings=(p_recipe->>'servings')::numeric,
      prep_minutes=(p_recipe->>'prep_minutes')::int, cook_minutes=(p_recipe->>'cook_minutes')::int,
      source_url=p_recipe->>'source_url', source_name=p_recipe->>'source_name', updated_at=now(),
      community_parent_id=case when p_recipe ? 'community_parent_id' then (p_recipe->>'community_parent_id')::uuid else community_parent_id end
      where id=v_recipe_id and user_id=owner;
    delete from public.recipe_ingredients where recipe_id=v_recipe_id and user_id=owner;
    delete from public.recipe_steps where recipe_id=v_recipe_id and user_id=owner;
  else
    insert into public.recipes(user_id,title,servings,prep_minutes,cook_minutes,source_url,source_name,community_parent_id)
      values(owner,btrim(p_recipe->>'title'),(p_recipe->>'servings')::numeric,
        (p_recipe->>'prep_minutes')::int,(p_recipe->>'cook_minutes')::int,p_recipe->>'source_url',p_recipe->>'source_name',
        (p_recipe->>'community_parent_id')::uuid) returning id into v_recipe_id;
  end if;
  insert into public.recipe_ingredients(recipe_id,user_id,position,raw_text,quantity,unit,name,grams,food_source,food_source_id,nutrition,section,match_status)
    select v_recipe_id,owner,(ordinality-1)::int,x.raw_text,x.quantity,x.unit,x.name,x.grams,x.food_source,x.food_source_id,x.nutrition,x.section,x.match_status
    from jsonb_array_elements(p_ingredients) with ordinality as element(value,ordinality)
    cross join lateral jsonb_to_record(element.value) as x(raw_text text,quantity numeric,unit text,name text,grams numeric,
      food_source text,food_source_id text,nutrition jsonb,section text,match_status text);
  insert into public.recipe_steps(recipe_id,user_id,position,text,timer_seconds)
    select v_recipe_id,owner,(ordinality-1)::int,x.text,x.timer_seconds
    from jsonb_array_elements(p_steps) with ordinality as element(value,ordinality)
    cross join lateral jsonb_to_record(element.value) as x(text text,timer_seconds int);
  return v_recipe_id;
end $$;

create function public.replace_generated_groceries(p_week date,p_items jsonb,p_expected_user_id uuid)
returns int language plpgsql security invoker set search_path = pg_catalog, public as $$
declare owner uuid := auth.uid(); count_items int;
begin
  if owner is null then raise exception 'Sign in to save groceries'; end if;
  if owner is distinct from p_expected_user_id then raise exception 'Your account changed. Grocery list was not saved'; end if;
  if p_week is null or extract(isodow from p_week)<>1 or jsonb_typeof(p_items) is distinct from 'array'
    or jsonb_array_length(p_items)>1000 or octet_length(p_items::text)>500000
    then raise exception 'Invalid generated grocery list'; end if;
  perform pg_advisory_xact_lock(hashtextextended(owner::text || p_week::text,0));
  if exists(select 1 from jsonb_to_recordset(p_items) as x(name text,quantity_value numeric)
    where name is null or length(btrim(name)) not between 1 and 500 or quantity_value<0)
    then raise exception 'Invalid grocery item'; end if;
  delete from public.grocery_items where user_id=owner and generated_week=p_week and source='plan' and not checked;
  insert into public.grocery_items(user_id,name,source,quantity,quantity_value,unit,section,generated_week,from_recipes)
    select owner,x.name,'plan',x.quantity,x.quantity_value,x.unit,x.section,p_week,coalesce(x.from_recipes,'{}')
    from jsonb_to_recordset(p_items) as x(name text,quantity text,quantity_value numeric,unit text,section text,from_recipes text[]);
  get diagnostics count_items=row_count;
  return count_items;
end $$;
revoke all on function public.save_private_recipe(jsonb,jsonb,jsonb),public.replace_generated_groceries(date,jsonb,uuid) from public,anon;
grant execute on function public.save_private_recipe(jsonb,jsonb,jsonb),public.replace_generated_groceries(date,jsonb,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
