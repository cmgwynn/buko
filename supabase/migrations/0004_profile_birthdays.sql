-- Additive upgrade: existing users supply their real birthday; never infer one from birth_year.
begin;

alter table public.profiles add column if not exists birth_date date;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_birth_date_valid'
  ) then
    alter table public.profiles add constraint profiles_birth_date_valid
      check (
        birth_date is null or (
          birth_date >= date '1900-01-01'
          and birth_date <= current_date
          and birth_year = extract(year from birth_date)::int
        )
      );
  end if;
end;
$$;

comment on column public.profiles.birth_date is
  'Private calendar birthday. Nullable for legacy profiles. Age is calculated in the user device local calendar; Feb 29 advances on March 1 in non-leap years.';

-- Existing owner-only profile RLS policies also protect this column.
notify pgrst, 'reload schema';
commit;
