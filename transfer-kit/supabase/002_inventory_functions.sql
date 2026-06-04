-- =============================================================================
-- Inventory module — atomic functions (Supabase / PostgreSQL).
-- Apply as a Supabase migration:  supabase migration new inventory_functions
-- Port of backend/src/modules/inventory/service/inventory.service.ts (verified).
-- ⚠️ Verify: service_executions → service link, status enum/column, completed_at.
-- =============================================================================

-- Complete a service execution: deduct all recipe materials, journal them,
-- raise low-stock notifications, and flip the status — all in ONE transaction.
-- SECURITY DEFINER so it can write inventory_transactions under RLS; it enforces
-- the caller's role itself.
create or replace function complete_service_execution(p_execution_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service_id uuid;
  v_recipe_id  uuid;
  v_user_id    uuid := auth.uid();
  v_role       text := coalesce(auth.jwt() ->> 'role', '');
  r record;
begin
  -- Authorization: only the clinician (DOCTOR) or an ADMIN may complete.
  if v_role not in ('ADMIN', 'DOCTOR') then
    raise exception 'Недостаточно прав для завершения процедуры.' using errcode = 'P0003';
  end if;

  -- 1. Resolve the execution → its service (lock the row).
  select service_id into v_service_id
  from service_executions
  where id = p_execution_id
  for update;

  if v_service_id is null then
    raise exception 'Выполнение услуги не найдено.' using errcode = 'P0002';
  end if;

  select id into v_recipe_id from service_recipes where service_id = v_service_id;

  -- 2. Deduct by recipe, locking stock rows (race-safe; no negative balances).
  if v_recipe_id is not null then
    for r in
      select ri.inventory_item_id, ri.quantity,
             ii.current_stock, ii.min_stock, ii.name
      from recipe_ingredients ri
      join inventory_items ii on ii.id = ri.inventory_item_id
      where ri.recipe_id = v_recipe_id
      for update of ii
    loop
      -- 3. Stock check — abort the whole transaction if short.
      if r.current_stock < r.quantity then
        raise exception
          'Недостаточно материала: %. Остаток: %. Требуется: %',
          r.name, r.current_stock, r.quantity
          using errcode = 'P0001';
      end if;

      update inventory_items
        set current_stock = current_stock - r.quantity, updated_at = now()
        where id = r.inventory_item_id;

      -- Journal + idempotency (repeat completion is a no-op for logged items).
      insert into inventory_transactions
        (inventory_item_id, service_execution_id, user_id, quantity, type)
      values
        (r.inventory_item_id, p_execution_id, v_user_id, r.quantity, 'CONSUMPTION')
      on conflict (service_execution_id, inventory_item_id)
        where type = 'CONSUMPTION' do nothing;

      -- 4. minStock breach → notification for admin / manager.
      if (r.current_stock - r.quantity) < r.min_stock then
        insert into low_stock_notifications (inventory_item_id, stock_at_event, min_stock)
        values (r.inventory_item_id, r.current_stock - r.quantity, r.min_stock);
      end if;
    end loop;
  end if;

  -- 5. Status change — SAME transaction as the deduction.
  update service_executions
    set status = 'completed', completed_at = now()   -- ⚠️ align enum/column
    where id = p_execution_id;
end;
$$;

-- Restock: increment stock + RESTOCK journal row, atomically. ADMIN / MANAGER.
create or replace function restock_inventory_item(p_item_id uuid, p_quantity numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role    text := coalesce(auth.jwt() ->> 'role', '');
begin
  if v_role not in ('ADMIN', 'MANAGER') then
    raise exception 'Недостаточно прав.' using errcode = 'P0003';
  end if;
  if p_quantity <= 0 then
    raise exception 'Количество должно быть положительным.' using errcode = 'P0004';
  end if;

  update inventory_items
    set current_stock = current_stock + p_quantity, updated_at = now()
    where id = p_item_id;
  if not found then
    raise exception 'Материал не найден.' using errcode = 'P0002';
  end if;

  insert into inventory_transactions (inventory_item_id, user_id, quantity, type)
  values (p_item_id, v_user_id, p_quantity, 'RESTOCK');
end;
$$;
