import { useEffect, useMemo, useState } from 'react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  useMutation,
  useQuery,
  useQueryClient
} from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';

import * as api from './api';
import {
  UpsertRecipeDto,
  type InventoryItem,
  type Recipe
} from './dto';

// -- Inline SVG icons (no icon dependency) -----------------------------------

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

// -- Form types --------------------------------------------------------------

type FormValues = UpsertRecipeDto;

interface RecipeEditorProps {
  serviceId: string;
  serviceName?: string;
}

const recipeKey = (serviceId: string) => ['recipe', serviceId] as const;

export function RecipeEditor({ serviceId, serviceName }: RecipeEditorProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Редактировать состав услуги"
        className="inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        <PencilIcon className="h-5 w-5" />
      </button>

      <AnimatePresence>
        {open ? (
          <EditorPanel
            key="panel"
            serviceId={serviceId}
            serviceName={serviceName}
            onClose={() => setOpen(false)}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

interface EditorPanelProps {
  serviceId: string;
  serviceName?: string;
  onClose: () => void;
}

function EditorPanel({ serviceId, serviceName, onClose }: EditorPanelProps) {
  const queryClient = useQueryClient();

  const itemsQuery = useQuery({
    queryKey: ['items'],
    queryFn: api.listItems
  });

  const recipeQuery = useQuery({
    queryKey: recipeKey(serviceId),
    queryFn: () => api.getRecipe(serviceId)
  });

  const items = useMemo<InventoryItem[]>(
    () => itemsQuery.data ?? [],
    [itemsQuery.data]
  );

  const {
    control,
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isDirty }
  } = useForm<FormValues>({
    resolver: zodResolver(UpsertRecipeDto),
    defaultValues: { serviceId, ingredients: [] }
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'ingredients'
  });

  // Hydrate the form once the recipe loads.
  useEffect(() => {
    if (!recipeQuery.data) return;
    reset({
      serviceId,
      ingredients: recipeQuery.data.ingredients.map((ing) => ({
        inventoryItemId: ing.inventoryItemId,
        quantity: ing.quantity
      }))
    });
  }, [recipeQuery.data, reset, serviceId]);

  const [savedAt, setSavedAt] = useState<number | null>(null);

  const mutation = useMutation({
    mutationFn: (dto: FormValues) => api.upsertRecipe(dto),
    onMutate: async (dto) => {
      await queryClient.cancelQueries({ queryKey: recipeKey(serviceId) });
      const previous = queryClient.getQueryData<Recipe>(recipeKey(serviceId));

      // Optimistically reflect the new config. IDs only; the server assigns
      // real ingredient row ids on settle.
      const optimistic: Recipe = {
        ingredients: dto.ingredients.map((ing, idx) => ({
          id: `optimistic-${idx}`,
          inventoryItemId: ing.inventoryItemId,
          quantity: ing.quantity
        }))
      };
      queryClient.setQueryData<Recipe>(recipeKey(serviceId), optimistic);

      return { previous };
    },
    onError: (_error, _dto, context) => {
      if (context?.previous) {
        queryClient.setQueryData(recipeKey(serviceId), context.previous);
      }
      // The thrown error.message is a safe, user-facing string (see api.ts).
    },
    onSuccess: () => {
      setSavedAt(Date.now());
    },
    onSettled: () => {
      // The system now uses the new config; refetch the source of truth.
      void queryClient.invalidateQueries({ queryKey: recipeKey(serviceId) });
    }
  });

  const onSubmit = handleSubmit((values) => {
    setSavedAt(null);
    mutation.mutate(values);
  });

  const loading = itemsQuery.isLoading || recipeQuery.isLoading;
  const loadError = itemsQuery.isError || recipeQuery.isError;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.985 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="absolute right-0 z-20 mt-3 w-[min(92vw,520px)] origin-top-right rounded-2xl border border-slate-200/70 bg-white p-7 shadow-soft"
    >
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Состав услуги
          </h2>
          {serviceName ? (
            <p className="mt-1 text-sm text-slate-500">{serviceName}</p>
          ) : (
            <p className="mt-1 text-sm text-slate-500">
              Материалы, списываемые при выполнении
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть"
          className="-mr-1 -mt-1 inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          <div className="h-11 animate-pulse rounded-xl bg-slate-100" />
          <div className="h-11 animate-pulse rounded-xl bg-slate-100" />
        </div>
      ) : loadError ? (
        <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-600">
          Не удалось загрузить данные. Попробуйте обновить страницу.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-3">
            <AnimatePresence initial={false}>
              {fields.map((field, index) => (
                <IngredientRow
                  key={field.id}
                  index={index}
                  items={items}
                  control={control}
                  register={register}
                  watch={watch}
                  onRemove={() => remove(index)}
                  error={errors.ingredients?.[index]}
                />
              ))}
            </AnimatePresence>

            {fields.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-400">
                Пока нет ингредиентов. Добавьте первый материал.
              </p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() =>
              append({
                inventoryItemId: items[0]?.id ?? '',
                quantity: 1
              })
            }
            disabled={items.length === 0 || fields.length >= 50}
            className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-accent transition hover:bg-accent/5 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <PlusIcon className="h-4 w-4" />
            Добавить материал
          </button>

          {mutation.isError ? (
            <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-600">
              {(mutation.error as Error).message}
            </p>
          ) : null}

          <div className="flex items-center justify-between gap-4 pt-2">
            <AnimatePresence mode="wait">
              {savedAt && !mutation.isPending ? (
                <motion.span
                  key="saved"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-sm text-emerald-600"
                >
                  Сохранено
                </motion.span>
              ) : (
                <span key="spacer" />
              )}
            </AnimatePresence>

            <button
              type="submit"
              disabled={mutation.isPending || !isDirty}
              className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {mutation.isPending ? 'Сохранение…' : 'Сохранить состав'}
            </button>
          </div>
        </form>
      )}
    </motion.div>
  );
}

// -- Single ingredient row ---------------------------------------------------

import type {
  Control,
  FieldErrors,
  UseFormRegister,
  UseFormWatch
} from 'react-hook-form';

interface IngredientRowProps {
  index: number;
  items: InventoryItem[];
  control: Control<FormValues>;
  register: UseFormRegister<FormValues>;
  watch: UseFormWatch<FormValues>;
  onRemove: () => void;
  error: FieldErrors<FormValues>['ingredients'] extends infer T
    ? T extends Array<infer U>
      ? U
      : undefined
    : undefined;
}

function IngredientRow({
  index,
  items,
  control,
  register,
  watch,
  onRemove,
  error
}: IngredientRowProps) {
  const selectedId = watch(`ingredients.${index}.inventoryItemId`);
  const selectedItem = items.find((it) => it.id === selectedId);
  const unitCode = selectedItem?.unit?.code ?? '—';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.18 }}
      className="overflow-hidden"
    >
      <div className="flex items-start gap-2">
        {/* Material select — value is ALWAYS the item id, never the name. */}
        <div className="min-w-0 flex-1">
          <Controller
            control={control}
            name={`ingredients.${index}.inventoryItemId`}
            render={({ field }) => (
              <select
                {...field}
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 shadow-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
              >
                {items.map((it) => (
                  <option key={it.id} value={it.id}>
                    {it.name} · {it.sku}
                  </option>
                ))}
              </select>
            )}
          />
          {error?.inventoryItemId ? (
            <p className="mt-1 text-xs text-rose-500">Выберите материал</p>
          ) : null}
        </div>

        {/* Quantity */}
        <div className="w-28 shrink-0">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20">
            <input
              type="number"
              step="any"
              min={0}
              inputMode="decimal"
              {...register(`ingredients.${index}.quantity`, {
                valueAsNumber: true
              })}
              className="w-full bg-transparent text-sm text-slate-800 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
            />
            <span className="select-none text-xs font-medium text-slate-400">
              {unitCode}
            </span>
          </div>
          {error?.quantity ? (
            <p className="mt-1 text-xs text-rose-500">&gt; 0</p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={onRemove}
          aria-label="Удалить материал"
          className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-400 transition hover:bg-rose-50 hover:text-rose-500"
        >
          <TrashIcon className="h-4 w-4" />
        </button>
      </div>
    </motion.div>
  );
}
