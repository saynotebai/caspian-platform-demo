# Порядок применения и чек-лист

## Apply order (в сессии с доступом к caspian-platform)
1. [ ] `supabase migration new inventory_schema` → `supabase/001_inventory_schema.sql`
2. [ ] `supabase migration new inventory_functions` → `supabase/002_inventory_functions.sql`
3. [ ] `supabase db push` (или применить через CI/Studio).
4. [ ] Server actions по `nextjs/integration.md`.
5. [ ] Перенести `frontend/src/inventory/*` (из `main`) в Next.js, заменить `api.ts`.
6. [ ] Seed: адаптировать `backend/prisma/seed.ts` → `insert ... on conflict do nothing`.

## ⚠️ Сверить с реальной схемой (2 места)
- [ ] **`service_executions` → `service`**: реальная таблица выполнений и колонка `service_id`.
      Если в проекте это `appointments`/`appointment_services` — переключить FK и RPC.
- [ ] **Статус**: реальные значения (по коммитам видно `pending/confirmed/in_chair/late/scheduled`).
      Подтвердить терминальный статус (`completed`/`done`) и поле даты завершения в `update` RPC.

Если `services` / `service_executions` уже существуют — удалить их `create table`
из `001_...sql` и навести FK на реальные таблицы.

## Чек-лист рисков (перед мержем в caspian-platform)
- [ ] Списание и смена статуса — в одной функции/транзакции (RPC).
- [ ] `for update of inventory_items` присутствует (анти-гонка, без отрицательных остатков).
- [ ] Частичный UNIQUE на CONSUMPTION (`uq_consumption_once`) + `on conflict do nothing` (идемпотентность повторного завершения).
- [ ] RLS включён на всех новых таблицах; роли (`ADMIN/MANAGER/DOCTOR`) совпадают с моделью проекта.
- [ ] Внутренние ошибки БД не утекают пользователю (только `P0001`/`P0003` сообщения наружу).
- [ ] Бэкофилл рецептов для существующих услуг — отдельная безопасная миграция.
- [ ] `numeric(14,3)` для остатков/дозировок (без float-дрейфа).
- [ ] Realtime-подписка на `low_stock_notifications` для админа/управляющего (опционально).

## Источник истины (рабочий код в `main`)
- backend бизнес-логика: `backend/src/modules/inventory/service/inventory.service.ts`
  (deduct, recipe upsert, restock, history, low-stock) + тесты.
- атомарная точка: `backend/src/modules/appointments/service/appointment.service.ts`.
- авторизация: `backend/src/lib/auth.ts` (роли → в Supabase это RLS + RPC-проверки).
- frontend: `frontend/src/inventory/*` (переносится почти как есть).
