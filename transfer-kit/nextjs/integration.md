# Next.js integration (Supabase)

Маппинг Express-эндпоинтов из demo на Next.js server actions + Supabase. Бизнес-
логика списания живёт в RPC (`002_inventory_functions.sql`); server actions —
тонкие: валидируют Zod-DTO, дёргают `supabase.rpc` / `from(...)`, возвращают
безопасные сообщения (без деталей БД).

## Эндпоинт → server action

| Demo (Express) | Next.js server action | Supabase |
| --- | --- | --- |
| `POST /executions/:id/complete` | `completeExecution(executionId)` | `rpc('complete_service_execution')` |
| `POST /inventory/restock` | `restock(itemId, qty)` | `rpc('restock_inventory_item')` |
| `GET /inventory/items` | `listItems()` | `from('inventory_items').select('*, unit:units(*)')` |
| `GET /services/:id/recipe` | `getRecipe(serviceId)` | `from('recipe_ingredients').select(...)` |
| `PUT /services/:id/recipe` | `upsertRecipe(dto)` | delete+insert в транзакции/RPC |
| `GET /inventory/transactions` | `listTransactions(filters)` | `from('inventory_transactions').select(... join ...).range(offset, offset+limit-1)` |
| `GET /inventory/low-stock` | `listLowStock(resolved?)` | `from('low_stock_notifications').select(...)` |
| `PATCH /inventory/low-stock/:id/resolve` | `resolveLowStock(id)` | `update({resolved:true})` |

Авторизация: на чтение — RLS (`authenticated`); на мутации — RLS + проверки роли
внутри RPC (`auth.jwt() ->> 'role'`). Дополнительно можно проверять роль в server
action до вызова (быстрый отказ).

## Пример server action (завершение)

```ts
'use server';
import { z } from 'zod';
import { createServerClient } from '@/lib/supabase/server';

const Input = z.object({ executionId: z.string().uuid() });

export async function completeExecution(raw: unknown) {
  const parsed = Input.safeParse(raw);
  if (!parsed.success) return { ok: false as const, message: 'Некорректные данные запроса.' };

  const supabase = createServerClient();
  const { error } = await supabase.rpc('complete_service_execution', {
    p_execution_id: parsed.data.executionId,
  });

  if (error) {
    // P0001 = нехватка остатка (текст безопасен для врача); P0003 = нет прав.
    if (error.code === 'P0001' || error.code === 'P0003') {
      return { ok: false as const, message: error.message };
    }
    console.error('complete_service_execution failed', error);
    return { ok: false as const, message: 'Не удалось завершить процедуру. Попробуйте ещё раз.' };
  }
  return { ok: true as const };
}
```

## Пример пагинации журнала (server action)

```ts
const Query = z.object({
  type: z.enum(['CONSUMPTION','RESTOCK','ADJUSTMENT']).optional(),
  limit: z.number().int().min(1).max(200).default(20),
  offset: z.number().int().min(0).default(0),
});
// ...
let q = supabase
  .from('inventory_transactions')
  .select('id,type,quantity,created_at,user_id, inventory_item:inventory_items(id,name,unit:units(code)), service_execution:service_executions(id,patient_id,service:services(id,name))')
  .order('created_at', { ascending: false })
  .range(offset, offset + limit - 1);
if (type) q = q.eq('type', type);
```

## Frontend — почти без изменений

Компоненты из `frontend/src/inventory/` переносятся в Next.js как клиентские
(`'use client'`) и используют TanStack Query поверх server actions:

| Файл | Заметки по переносу |
| --- | --- |
| `RecipeEditor.tsx` | без изменений (RHF+Zod+framer-motion); `upsertRecipe` → server action |
| `InventoryJournal.tsx` | без изменений; пагинация (page size 20, keepPreviousData) уже есть |
| `LowStockBanner.tsx` | без изменений; optimistic resolve → server action |
| `CompleteExecutionButton.tsx` + `useCompleteExecution.ts` | optimistic; `completeExecution` → server action |
| `dto.ts` | Zod-DTO переносятся как есть (общий контракт) |
| `api.ts` | заменить `fetch(...)` на вызовы server actions / `supabase.rpc`; убрать ручной Bearer (Supabase-сессия сама) |

Контракт DTO (`RecipeIngredientInput`, `UpsertRecipeDto` с `.max(50)`) остаётся
идентичным — фронт и server actions делят его.
