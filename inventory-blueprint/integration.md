# Integration — server action, validation, error handling, frontend

## Точка интеграции (тонкий server action)

Заменить прямую смену статуса на вызов атомарной RPC. Контроллер тонкий, логика — в БД-функции.

```ts
// ⚠️ реальный путь определится после доступа к репо, напр.:
// app/(app)/calendar/actions/complete-execution.ts
//   или modules/appointments/service/appointment.service.ts
'use server';
import { z } from 'zod';
import { createServerClient } from '@/lib/supabase/server';

const Input = z.object({ executionId: z.string().uuid() });   // Zod DTO

export async function completeExecution(raw: unknown) {
  const parsed = Input.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: 'Некорректные данные запроса.' };
  }

  const supabase = createServerClient();
  const { error } = await supabase.rpc('complete_service_execution', {
    p_execution_id: parsed.data.executionId,
  });

  if (error) {
    // P0001 = бизнес-ошибка (нехватка остатка) — её текст безопасно показать врачу.
    if (error.code === 'P0001') return { ok: false, message: error.message };
    // Всё остальное — НЕ отдаём детали БД наружу.
    console.error('complete_service_execution failed', error);
    return { ok: false, message: 'Не удалось завершить процедуру. Попробуйте ещё раз.' };
  }
  return { ok: true };
}
```

**Сообщение врачу при нехватке** приходит прямо из функции:
`"Недостаточно материала: Композит Filtek. Остаток: 1.2. Требуется: 2.5"`.

## No-code редактор рецептов (иконка-карандаш)

- Кнопка-карандаш у каждой услуги → панель состава.
- Операции: добавить / удалить ингредиент, изменить `quantity`, сменить `unit` — всё по **ID**.
- React Hook Form + Zod-резолвер; сохранение `upsert` в `recipe_ingredients`.
- Никаких хардкодных рецептов: после сохранения `complete_service_execution` сразу использует новую конфигурацию (читает `recipe_ingredients` на лету).

```ts
const Ingredient = z.object({
  inventoryItemId: z.string().uuid(),
  quantity: z.number().positive(),
});
const RecipeForm = z.object({
  serviceId: z.string().uuid(),
  ingredients: z.array(Ingredient).max(50),   // ограничение размера рецепта (perf)
});
```

## UX списания (optimistic, без блокировки интерфейса)

```ts
const m = useMutation({
  mutationFn: () => completeExecution({ executionId }),
  onMutate: async () => {
    await qc.cancelQueries({ queryKey: ['executions'] });
    const prev = qc.getQueryData(['executions']);
    qc.setQueryData(['executions'], optimisticMarkCompleted(executionId)); // мгновенно
    return { prev };
  },
  onError: (_e, _v, ctx) => {
    qc.setQueryData(['executions'], ctx?.prev);                            // откат
    toast.error(/* message из ответа */);                                 // без тех-деталей
  },
  onSettled: () => qc.invalidateQueries({ queryKey: ['executions'] }),
});
```

Низкие остатки (`low_stock_notifications`) — подписка Supabase Realtime → бейдж/тост у
администратора и управляющего.

## Риски (контрольный список перед мержем)
- [ ] `SELECT … FOR UPDATE OF inventory_items` присутствует (анти-гонка).
- [ ] Частичный UNIQUE-индекс на CONSUMPTION (идемпотентность повторного COMPLETED).
- [ ] Списание и смена статуса — в одной функции/транзакции.
- [ ] RLS на новые таблицы (read/mutate по ролям).
- [ ] Бэкофилл рецептов для существующих услуг — отдельная безопасная миграция.
- [ ] Сверены 2 ⚠️-места (связь execution→service, значения статуса).
