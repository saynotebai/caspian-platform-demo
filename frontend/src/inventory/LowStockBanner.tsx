import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { listLowStock, resolveLowStock } from './api';
import type { LowStockNotification } from './dto';

// =============================================================================
// Low-stock feed for admin / manager. Shows unresolved minStock breaches and
// lets them mark each as handled (optimistic). Breathing, low-noise UI.
// =============================================================================

const LOW_STOCK_KEY = ['low-stock', 'unresolved'] as const;

export function LowStockBanner() {
  const qc = useQueryClient();

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: LOW_STOCK_KEY,
    queryFn: () => listLowStock(false)
  });

  const resolve = useMutation({
    mutationFn: (id: string) => resolveLowStock(id),
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: LOW_STOCK_KEY });
      const prev = qc.getQueryData<LowStockNotification[]>(LOW_STOCK_KEY);
      qc.setQueryData<LowStockNotification[]>(LOW_STOCK_KEY, (cur) =>
        (cur ?? []).filter((n) => n.id !== id)
      );
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(LOW_STOCK_KEY, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: LOW_STOCK_KEY })
  });

  if (isLoading || notifications.length === 0) return null;

  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50/70 p-6 shadow-soft">
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-400/20 text-amber-600">
          {/* alert-triangle */}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </span>
        <h2 className="text-sm font-semibold text-amber-800">
          Низкие остатки · {notifications.length}
        </h2>
      </div>

      <ul className="space-y-2">
        <AnimatePresence initial={false}>
          {notifications.map((n) => (
            <motion.li
              key={n.id}
              layout
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0, marginTop: 0 }}
              className="flex items-center justify-between gap-4 rounded-xl bg-white px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">{n.itemName}</p>
                <p className="text-xs text-slate-500">
                  Остаток {n.stockAtEvent}
                  {n.unitCode ? ` ${n.unitCode}` : ''} · минимум {n.minStock}
                  {n.unitCode ? ` ${n.unitCode}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => resolve.mutate(n.id)}
                className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-amber-300 hover:text-amber-700"
              >
                Обработано
              </button>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </section>
  );
}

export default LowStockBanner;
