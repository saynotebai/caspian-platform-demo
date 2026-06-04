import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { listTransactions } from './api';
import type { InventoryTxType } from './dto';

// =============================================================================
// Stock-movement journal. Read-only history of every deduction / restock so the
// full audit trail can be reconstructed (date, type, material, qty, service,
// patient). Minimal, breathing table with a type filter.
// =============================================================================

const TYPE_LABEL: Record<InventoryTxType, string> = {
  CONSUMPTION: 'Списание',
  RESTOCK: 'Поступление',
  ADJUSTMENT: 'Корректировка'
};

const TYPE_STYLE: Record<InventoryTxType, string> = {
  CONSUMPTION: 'bg-rose-50 text-rose-600',
  RESTOCK: 'bg-emerald-50 text-emerald-600',
  ADJUSTMENT: 'bg-slate-100 text-slate-600'
};

const FILTERS: Array<{ label: string; value?: InventoryTxType }> = [
  { label: 'Все' },
  { label: 'Списания', value: 'CONSUMPTION' },
  { label: 'Поступления', value: 'RESTOCK' }
];

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' });
}

export function InventoryJournal() {
  const [type, setType] = useState<InventoryTxType | undefined>(undefined);

  const { data: rows = [], isLoading, isError, error } = useQuery({
    queryKey: ['inventory-journal', type ?? 'all'],
    queryFn: () => listTransactions({ type, limit: 100 })
  });

  return (
    <section className="rounded-2xl border border-slate-200/70 bg-white p-7 shadow-soft">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Журнал движения склада</h2>
          <p className="mt-1 text-sm text-slate-500">История списаний и поступлений.</p>
        </div>
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
          {FILTERS.map((f) => {
            const active = f.value === type;
            return (
              <button
                key={f.label}
                type="button"
                onClick={() => setType(f.value)}
                className={
                  'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ' +
                  (active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700')
                }
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {isLoading && <p className="py-8 text-center text-sm text-slate-400">Загрузка…</p>}
      {isError && (
        <p className="py-8 text-center text-sm text-rose-500">
          {(error as Error)?.message ?? 'Не удалось загрузить журнал.'}
        </p>
      )}

      {!isLoading && !isError && rows.length === 0 && (
        <p className="py-8 text-center text-sm text-slate-400">Записей пока нет.</p>
      )}

      {rows.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-100">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-2.5 font-medium">Дата</th>
                <th className="px-4 py-2.5 font-medium">Операция</th>
                <th className="px-4 py-2.5 font-medium">Материал</th>
                <th className="px-4 py-2.5 text-right font-medium">Кол-во</th>
                <th className="px-4 py-2.5 font-medium">Услуга / пациент</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r, i) => (
                <motion.tr
                  key={r.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: Math.min(i * 0.015, 0.3) }}
                  className="text-slate-700"
                >
                  <td className="whitespace-nowrap px-4 py-2.5 text-slate-500">
                    {formatDate(r.createdAt)}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={'rounded-full px-2 py-0.5 text-xs font-medium ' + TYPE_STYLE[r.type]}>
                      {TYPE_LABEL[r.type]}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-medium text-slate-900">{r.itemName}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {r.type === 'CONSUMPTION' ? '−' : '+'}
                    {r.quantity}
                    {r.unitCode ? ` ${r.unitCode}` : ''}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">
                    {r.serviceName ?? '—'}
                    {r.patientId ? ` · пациент ${r.patientId.slice(0, 8)}` : ''}
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default InventoryJournal;
