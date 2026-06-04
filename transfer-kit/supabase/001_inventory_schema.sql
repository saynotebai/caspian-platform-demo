-- =============================================================================
-- Inventory module — schema for Supabase / PostgreSQL.
-- Apply as a Supabase migration:  supabase migration new inventory_schema
-- Mirrors the Prisma schema in backend/prisma/schema.prisma (verified, tested).
-- ⚠️ Verify the real `services` / `service_executions` table names before apply.
-- =============================================================================

create type inventory_tx_type as enum ('CONSUMPTION', 'RESTOCK', 'ADJUSTMENT');

create table units (
  id   uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,                      -- г, мл, шт, уп
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table inventory_items (
  id            uuid primary key default gen_random_uuid(),
  sku           text not null unique,
  name          text not null,
  unit_id       uuid not null references units(id),
  current_stock numeric(14,3) not null default 0 check (current_stock >= 0),
  min_stock     numeric(14,3) not null default 0 check (min_stock >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ⚠️ If `services` already exists in caspian-platform, DROP these two lines and
-- point the FK at the real table instead.
create table services (
  id   uuid primary key default gen_random_uuid(),
  name text not null
);

create table service_recipes (
  id         uuid primary key default gen_random_uuid(),
  service_id uuid not null unique references services(id) on delete cascade
);

create table recipe_ingredients (
  id                uuid primary key default gen_random_uuid(),
  recipe_id         uuid not null references service_recipes(id) on delete cascade,
  inventory_item_id uuid not null references inventory_items(id),
  quantity          numeric(14,3) not null check (quantity > 0),
  unique (recipe_id, inventory_item_id)
);

-- ⚠️ If `service_executions` already exists, DROP this and reference the real one.
create table service_executions (
  id           uuid primary key default gen_random_uuid(),
  service_id   uuid not null references services(id),
  patient_id   uuid,
  status       text not null default 'pending',     -- ⚠️ align with real status model
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table inventory_transactions (
  id                   uuid primary key default gen_random_uuid(),
  inventory_item_id    uuid not null references inventory_items(id),
  service_execution_id uuid references service_executions(id),
  user_id              uuid references auth.users(id),
  quantity             numeric(14,3) not null,
  type                 inventory_tx_type not null,
  created_at           timestamptz not null default now()
);

-- Idempotency: CONSUMPTION rows set service_execution_id, so a given
-- (execution, item) pair can be consumed once. RESTOCK/ADJUSTMENT leave it NULL
-- (Postgres allows multiple NULLs in a composite unique index).
create unique index uq_consumption_once
  on inventory_transactions (service_execution_id, inventory_item_id)
  where type = 'CONSUMPTION';

create index idx_recipe_ingredients_recipe on recipe_ingredients (recipe_id);
create index idx_inv_tx_item               on inventory_transactions (inventory_item_id);
create index idx_inv_tx_created_at         on inventory_transactions (created_at desc);

create table low_stock_notifications (
  id                uuid primary key default gen_random_uuid(),
  inventory_item_id uuid not null references inventory_items(id),
  stock_at_event    numeric(14,3) not null,
  min_stock         numeric(14,3) not null,
  resolved          boolean not null default false,
  created_at        timestamptz not null default now()
);

-- =============================================================================
-- RLS. Reads for any authenticated user; mutations for ADMIN / MANAGER.
-- Role is read from the JWT claim `role` (set in app_metadata / a custom claim).
-- ⚠️ Adjust to the project's real role model (e.g. a profiles table).
-- =============================================================================
alter table units                   enable row level security;
alter table inventory_items         enable row level security;
alter table service_recipes         enable row level security;
alter table recipe_ingredients      enable row level security;
alter table inventory_transactions  enable row level security;
alter table low_stock_notifications enable row level security;

create or replace function auth_role() returns text
language sql stable as $$ select coalesce(auth.jwt() ->> 'role', '') $$;

-- Read: any authenticated user.
do $$
declare t text;
begin
  foreach t in array array[
    'units','inventory_items','service_recipes','recipe_ingredients',
    'inventory_transactions','low_stock_notifications'
  ] loop
    execute format(
      'create policy %I on %I for select to authenticated using (true);',
      t || '_read', t);
  end loop;
end $$;

-- Mutations (insert/update/delete): ADMIN / MANAGER only.
do $$
declare t text;
begin
  foreach t in array array[
    'units','inventory_items','service_recipes','recipe_ingredients','low_stock_notifications'
  ] loop
    execute format(
      'create policy %I on %I for all to authenticated using (auth_role() in (''ADMIN'',''MANAGER'')) with check (auth_role() in (''ADMIN'',''MANAGER''));',
      t || '_write', t);
  end loop;
end $$;

-- inventory_transactions are written by the SECURITY DEFINER RPC, not directly.
