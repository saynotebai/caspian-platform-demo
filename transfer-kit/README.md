# Inventory → caspian-platform · Transfer Kit

Готовый к применению пакет для переноса модуля складского учёта (auto-deduction)
из `caspian-platform-demo` (greenfield **Prisma + Express**) в реальный
`caspian-platform` (**Supabase + Next.js**).

Источник истины по бизнес-логике и UI — рабочий, собранный и протестированный код
в `main` этого репозитория:
- backend: `backend/src/modules/inventory/**`, `backend/src/modules/appointments/service/appointment.service.ts`
- frontend: `frontend/src/inventory/**` (переносится в Next.js почти как есть)

## Что переносим

| Возможность | В demo (Prisma/Express) | В caspian-platform (Supabase/Next.js) |
| --- | --- | --- |
| Схема БД | `prisma/schema.prisma` + миграция | `supabase/001_inventory_schema.sql` (этот кит) |
| Атомарное списание при завершении | `appointment.service.completeServiceExecution` + `$transaction` | RPC `complete_service_execution` — `supabase/002_inventory_functions.sql` |
| Журнал + история (пагинация) | `GET /inventory/transactions` | `select` из `inventory_transactions` (server action / RPC) |
| Low-stock уведомления | `GET/PATCH /inventory/low-stock` | таблица `low_stock_notifications` + Realtime |
| No-code редактор рецептов | `RecipeEditor.tsx` | тот же React-компонент (см. `nextjs/integration.md`) |
| Optimistic завершение | `useCompleteExecution.ts` | тот же хук, дергает server action / `rpc` |
| Авторизация (роли) | JWT + `requireRole` middleware | Supabase RLS по claim `role` + проверки в server actions |

## Почему атомарность в БД (RPC), а не в `$transaction`

В Next.js + Supabase клиент/server action не оборачивает мультистейтмент-транзакцию
надёжно. Postgres-функция `complete_service_execution` атомарна по определению —
проверка остатков, списание, журнал, смена статуса либо проходят целиком, либо
откатываются. Это и есть требование «статус + списание в одной транзакции».

## Порядок применения (в сессии с доступом к caspian-platform)

1. **Миграции (только через Supabase migrations):**
   - `supabase migration new inventory_schema`  → вставить `supabase/001_inventory_schema.sql`
   - `supabase migration new inventory_functions` → вставить `supabase/002_inventory_functions.sql`
   - `supabase db push` (или применить в CI).
2. **Сверить 2 ⚠️-места** (см. `CHECKLIST.md`): связь `service_executions → service`
   и реальные значения статуса (`completed`/`done`).
3. **Server actions** под существующую структуру модулей — по `nextjs/integration.md`
   (тонкие, Zod-DTO, безопасные ошибки без утечки БД).
4. **Frontend**: перенести `frontend/src/inventory/*` в Next.js (`'use client'`),
   заменить `api.ts` на вызовы server actions / `supabase.rpc`. Компоненты
   (`RecipeEditor`, `InventoryJournal` с пагинацией, `LowStockBanner`,
   `CompleteExecutionButton`) переносятся почти без изменений.
5. **RLS**: политики в `001_inventory_schema.sql` (read — authenticated; mutate —
   ADMIN/MANAGER; completion — через RPC). Сверить с реальной моделью ролей проекта.
6. **Seed**: адаптировать `backend/prisma/seed.ts` под Supabase (insert ... on conflict).

## Файлы кита
- `supabase/001_inventory_schema.sql` — таблицы, enum, индексы, RLS.
- `supabase/002_inventory_functions.sql` — RPC списания/завершения (+ restock).
- `nextjs/integration.md` — server actions, DTO, ошибки, маппинг UI.
- `CHECKLIST.md` — порядок, ⚠️-сверки, чек-лист рисков.
