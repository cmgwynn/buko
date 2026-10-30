-- Data-supported micronutrient snapshots and explicitly accepted calorie adjustments.
alter table public.food_log_entries
  add column if not exists micronutrients jsonb not null
  default '{"calciumMg":null,"ironMg":null,"potassiumMg":null,"vitaminCMg":null,"vitaminDMcg":null}'::jsonb;

alter table public.nutrition_targets
  add column if not exists adaptive_calorie_adjustment integer not null default 0
  check (adaptive_calorie_adjustment between -200 and 200);
