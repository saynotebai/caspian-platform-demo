-- Inventory module — schema (Supabase / PostgreSQL)
-- Apply as a Supabase migration:  supabase migration new inventory
-- ⚠️ Verify table name of services / service_executions against the real schema.

create type inventory_tx_type as enum ('CONSUMPTION', 'RESTOCK', 'ADJUSTMENT');

create table units (
  id   uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique                      -- г, мл, шт, уп
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

create table service_recipes (
  id         uuid primary key default gen_random_uuid(),
  service_id uuid not null unique references services(id)    -- ⚠️ verify
);

create table recipe_ingredients (
  id                uuid primary key default gen_random_uuid(),
  recipe_id         uuid not null references service_recipes(id) on delete cascade,
  inventory_item_id uuid not null references inventory_items(id),
  quantity          numeric(14,3) not null check (quantity > 0),
  unique (recipe_id, inventory_item_id)
);

create table inventory_transactions (
  id                   uuid primary key default gen_random_uuid(),
  inventory_item_id    uuid not null references inventory_items(id),
  service_execution_id uuid references service_executions(id),  -- ⚠️ verify
  user_id              uuid references auth.users(id),
  quantity             numeric(14,3) not null,
  type                 inventory_tx_type not null,
  created_at           timestamptz not null default now()
);

-- Idempotency: a repeated COMPLETED must not deduct twice.
create unique index uq_consumption_once
  on inventory_transactions (service_execution_id, inventory_item_id)
  where type = 'CONSUMPTION';

-- Helpful lookups
create index idx_recipe_ingredients_recipe on recipe_ingredients (recipe_id);
create index idx_inv_tx_item               on inventory_transactions (inventory_item_id);

-- Low-stock notifications (consumed by admin/manager UI via Supabase Realtime)
create table low_stock_notifications (
  id                uuid primary key default gen_random_uuid(),
  inventory_item_id uuid not null references inventory_items(id),
  stock_at_event    numeric(14,3) not null,
  min_stock         numeric(14,3) not null,
  resolved          boolean not null default false,
  created_at        timestamptz not null default now()
);

-- RLS (adjust roles to the project's auth model)
alter table inventory_items        enable row level security;
alter table recipe_ingredients     enable row level security;
alter table service_recipes        enable row level security;
alter table inventory_transactions enable row level security;
alter table low_stock_notifications enable row level security;
-- Example: authenticated staff can read; mutations restricted to admin/manager via policies.
