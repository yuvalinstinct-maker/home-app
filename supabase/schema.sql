-- home-app schema: household-scoped, RLS everywhere
create extension if not exists pgcrypto;

create table if not exists households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  join_code text not null default substr(replace(gen_random_uuid()::text,'-',''),1,6),
  created_at timestamptz not null default now()
);

create table if not exists profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  household_id uuid not null references households(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now(),
  unique (household_id, display_name)
);

create or replace function my_household() returns uuid
language sql stable security definer set search_path = public as
$$ select household_id from profiles where user_id = auth.uid() $$;

create table if not exists pantry_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  category text not null default 'אחר',
  quantity_state text not null default 'full' check (quantity_state in ('full','half','low')),
  is_open boolean not null default false,
  opened_at date,
  best_by date,
  is_protein boolean not null default false,
  location text not null default 'pantry' check (location in ('fridge','freezer','pantry')),
  package_size text,
  added_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists recipes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  title text not null,
  photo_url text,
  time_minutes int,
  servings numeric not null default 2,
  steps jsonb not null default '[]'::jsonb,
  notes text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references recipes(id) on delete cascade,
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  amount numeric,
  unit text,
  grams numeric,
  nutrition_key text,
  kcal numeric,
  protein numeric,
  matched boolean not null default false,
  position int not null default 0
);

create table if not exists ratings (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references recipes(id) on delete cascade,
  household_id uuid not null references households(id) on delete cascade,
  who text not null,
  stars int check (stars between 1 and 5),
  again boolean,
  next_time text,
  updated_at timestamptz not null default now(),
  unique (recipe_id, who)
);

create table if not exists meal_plan_entries (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  day date not null,
  slot text not null default 'dinner',
  recipe_id uuid references recipes(id) on delete set null,
  label text,
  note text,
  created_by text,
  updated_at timestamptz not null default now()
);

create table if not exists shopping_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  qty numeric,
  unit text,
  section text not null default 'אחר',
  added_by text,
  checked boolean not null default false,
  checked_at timestamptz,
  recipe_id uuid references recipes(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ingredient_nutrition (
  key text primary key,
  name_he text not null,
  aliases text[] not null default '{}',
  kcal_per_100 numeric not null,
  protein_per_100 numeric not null,
  unit_default text not null default 'g',
  piece_grams numeric,
  source text not null default 'curated',
  household_id uuid references households(id) on delete cascade
);

alter table households enable row level security;
alter table profiles enable row level security;
alter table pantry_items enable row level security;
alter table recipes enable row level security;
alter table recipe_ingredients enable row level security;
alter table ratings enable row level security;
alter table meal_plan_entries enable row level security;
alter table shopping_items enable row level security;
alter table ingredient_nutrition enable row level security;

create policy households_member on households for select using (id = my_household());
create policy profiles_select on profiles for select using (household_id = my_household() or user_id = auth.uid());
create policy profiles_insert on profiles for insert with check (user_id = auth.uid());
create policy profiles_update on profiles for update using (user_id = auth.uid());

create policy pantry_all on pantry_items for all using (household_id = my_household()) with check (household_id = my_household());
create policy recipes_all on recipes for all using (household_id = my_household()) with check (household_id = my_household());
create policy r_ing_all on recipe_ingredients for all using (household_id = my_household()) with check (household_id = my_household());
create policy ratings_all on ratings for all using (household_id = my_household()) with check (household_id = my_household());
create policy plan_all on meal_plan_entries for all using (household_id = my_household()) with check (household_id = my_household());
create policy shopping_all on shopping_items for all using (household_id = my_household()) with check (household_id = my_household());
create policy nutrition_read on ingredient_nutrition for select using (household_id is null or household_id = my_household());
create policy nutrition_write on ingredient_nutrition for insert with check (household_id = my_household());
create policy nutrition_update on ingredient_nutrition for update using (household_id = my_household());

-- household join by code: authenticated user may look up a household id by join code (used once at claim time)
create or replace function household_by_code(code text) returns uuid
language sql stable security definer set search_path = public as
$$ select id from households where join_code = upper(code) $$;

-- realtime
alter publication supabase_realtime add table pantry_items;
alter publication supabase_realtime add table recipes;
alter publication supabase_realtime add table recipe_ingredients;
alter publication supabase_realtime add table ratings;
alter publication supabase_realtime add table meal_plan_entries;
alter publication supabase_realtime add table shopping_items;
