# Inventory Module — Implementation Blueprint (Supabase)

> Согласованный архитектурный артефакт для модуля **складского учёта (Inventory)** Dental OS.
> Цель: полностью исключить ручное списание материалов — авто-списание по технологической
> карте услуги при переходе процедуры в статус `completed`/`done`, атомарно и идемпотентно.
>
> **Стек:** Supabase (PostgreSQL) + Next.js server actions + React / TanStack Query / RHF / Zod.
> **Реализуется в:** `saynotebai/caspian-platform` (НЕ в этом demo-репозитории).
> Этот пакет — портативное ядро для переноса в реальный репозиторий в новой сессии.

## Почему атомарность живёт в БД (RPC), а не в `prisma.$transaction`

Реальное приложение на Supabase: клиент / server action не может надёжно обернуть
мультистейтмент-транзакцию. Postgres-функция `complete_service_execution` атомарна по
определению — проверка остатков, списание, журнал, смена статуса либо проходят целиком,
либо откатываются. Это и есть требование «изменение статуса и списание — в одной транзакции».

## Доменная модель (только ID-связи)

```
Service ──< ServiceRecipe ──< RecipeIngredient >── InventoryItem >── Unit
                                                         │
ServiceExecution ──────────────< InventoryTransaction >──┘
```

| Сущность | Ключевые поля |
|---|---|
| `units` | id, name, code (`г`,`мл`,`шт`,`уп`) |
| `inventory_items` | id, sku, name, **unit_id**, current_stock `numeric(14,3)`, min_stock, timestamps |
| `service_recipes` | id, **service_id** (unique) |
| `recipe_ingredients` | id, **recipe_id**, **inventory_item_id**, quantity `numeric(14,3)` |
| `inventory_transactions` | id, **inventory_item_id**, **service_execution_id**, **user_id**, quantity, type, created_at |

Решения по дизайну:
- `quantity`/`stock` — `numeric(14,3)`, НЕ float (иначе дрейф остатков).
- Идемпотентность: частичный UNIQUE на `(service_execution_id, inventory_item_id) WHERE type='CONSUMPTION'`.
- Анти-гонка: `SELECT … FOR UPDATE OF inventory_items` (без этого — отрицательные остатки при параллельных `completed`).

## ⚠️ Два места для сверки с реальной схемой
1. **Связь `service_execution → service`** — как именно выполнение процедуры ссылается на услугу
   (таблица `service_executions` / `appointment_services` / иное и имя колонки `service_id`).
2. **Значения статуса** — реальный enum (по коммитам видно `pending/confirmed/in_chair/late/scheduled`);
   нужно подтвердить терминальный статус (`completed`/`done`) и поле даты завершения.

Всё остальное самодостаточно.

## Файлы пакета
- [`schema.sql`](./schema.sql) — таблицы, enum, индексы (→ Supabase migration).
- [`complete_service_execution.sql`](./complete_service_execution.sql) — атомарная RPC списания + смены статуса.
- [`integration.md`](./integration.md) — точка интеграции (server action), Zod-DTO, обработка ошибок, фронт.

## Порядок применения (в новой сессии с доступом к платформе)
1. `supabase migration new inventory` → вставить `schema.sql` → `supabase db push` / миграция.
2. Отдельной миграцией — функция из `complete_service_execution.sql` (сверив 2 ⚠️-места).
3. Заменить вызов смены статуса в реальном server action на `rpc('complete_service_execution', …)`.
4. RLS-политики на новые таблицы (read — staff; mutate — admin/manager).
5. Фронт: редактор рецептов (карандаш) + optimistic-списание.
