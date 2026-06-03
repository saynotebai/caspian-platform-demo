-- Atomic core: status change + material deduction in ONE transaction.
-- A Postgres function is the transactional unit (correct for Supabase).
-- ⚠️ Verify: service_executions → service link, status enum/column, completed_at field.

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
  r record;
begin
  -- 1. Resolve service for this execution (lock the execution row).
  select service_id into v_service_id
  from service_executions
  where id = p_execution_id
  for update;

  if v_service_id is null then
    raise exception 'Процедура не найдена' using errcode = 'P0002';
  end if;

  select id into v_recipe_id from service_recipes where service_id = v_service_id;

  -- 2. Deduct by recipe, locking stock rows (prevents race / negative stock).
  if v_recipe_id is not null then
    for r in
      select ri.inventory_item_id, ri.quantity,
             ii.current_stock, ii.min_stock, ii.name
      from recipe_ingredients ri
      join inventory_items ii on ii.id = ri.inventory_item_id
      where ri.recipe_id = v_recipe_id
      for update of ii
    loop
      -- 3. Stock check — abort whole transaction if insufficient.
      if r.current_stock < r.quantity then
        raise exception
          'Недостаточно материала: %. Остаток: %. Требуется: %',
          r.name, r.current_stock, r.quantity
          using errcode = 'P0001';
      end if;

      update inventory_items
        set current_stock = current_stock - r.quantity,
            updated_at = now()
        where id = r.inventory_item_id;

      -- Journal + idempotency (repeat COMPLETED is a no-op for already-logged items).
      insert into inventory_transactions
        (inventory_item_id, service_execution_id, user_id, quantity, type)
      values
        (r.inventory_item_id, p_execution_id, v_user_id, r.quantity, 'CONSUMPTION')
      on conflict do nothing;

      -- 4. minStock breach → notification for admin/manager.
      if (r.current_stock - r.quantity) < r.min_stock then
        insert into low_stock_notifications
          (inventory_item_id, stock_at_event, min_stock)
        values
          (r.inventory_item_id, r.current_stock - r.quantity, r.min_stock);
      end if;
    end loop;
  end if;

  -- 5. Status change — SAME transaction as the deduction.
  update service_executions
    set status = 'completed', completed_at = now()   -- ⚠️ verify enum/column
    where id = p_execution_id;
end;
$$;
