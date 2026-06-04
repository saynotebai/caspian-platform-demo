import type {
  InventoryItem,
  InventoryTransaction,
  InventoryTxType,
  LowStockNotification,
  Recipe,
  RecipeIngredient,
  UpsertRecipeDto
} from './dto';

// Base URL: configurable per environment, defaults to a same-origin /api proxy.
const API_URL = (import.meta.env.VITE_API_URL ?? '/api').replace(/\/$/, '');

const GENERIC_ERROR =
  'Не удалось выполнить операцию. Попробуйте ещё раз позже.';

// The backend wraps every response in an envelope:
//   success → { ok: true, data: T }
//   error   → { ok: false, message: string }  (message is always user-safe)
function extractMessage(body: unknown): string {
  if (
    body &&
    typeof body === 'object' &&
    'message' in body &&
    typeof (body as { message: unknown }).message === 'string'
  ) {
    return (body as { message: string }).message;
  }
  return GENERIC_ERROR;
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Parse a JSON envelope and return its `data`. On non-2xx, throw an Error whose
 * `message` is the server-provided `message` field (a user-safe string) or a
 * generic fallback. Internal/DB details are never surfaced to the UI.
 */
async function parse<T>(res: Response): Promise<T> {
  const body = await readJson(res);

  if (!res.ok) {
    throw new Error(extractMessage(body));
  }

  // Unwrap the { ok, data } envelope when present.
  if (body && typeof body === 'object' && 'data' in body) {
    return (body as { data: T }).data;
  }
  return body as T;
}

/**
 * For endpoints whose payload we ignore, but which may return an error JSON
 * body we must translate into a safe message.
 */
async function expectOk(res: Response): Promise<void> {
  if (res.ok) return;
  const body = await readJson(res);
  throw new Error(extractMessage(body));
}

const jsonHeaders = { 'Content-Type': 'application/json' } as const;

// The backend serializes Decimal columns as strings; coerce to number for UI.
function toNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

// -- Raw wire shapes (what the server actually sends) -------------------------

interface RawUnit {
  id: string;
  name: string;
  code: string;
}

interface RawInventoryItem {
  id: string;
  sku: string;
  name: string;
  unitId: string;
  unit?: RawUnit | null;
  currentStock: number | string;
  minStock: number | string;
}

interface RawRecipeIngredient {
  id: string;
  inventoryItemId: string;
  quantity: number | string;
}

interface RawRecipe {
  ingredients: RawRecipeIngredient[];
}

// -- Endpoints ----------------------------------------------------------------

export async function listItems(): Promise<InventoryItem[]> {
  const res = await fetch(`${API_URL}/inventory/items`);
  const raw = await parse<RawInventoryItem[]>(res);
  return raw.map((it) => ({
    id: it.id,
    sku: it.sku,
    name: it.name,
    unitId: it.unitId,
    unit: it.unit ?? undefined,
    currentStock: toNumber(it.currentStock),
    minStock: toNumber(it.minStock)
  }));
}

export async function getRecipe(serviceId: string): Promise<Recipe> {
  const res = await fetch(
    `${API_URL}/services/${encodeURIComponent(serviceId)}/recipe`
  );
  const raw = await parse<RawRecipe>(res);
  const ingredients: RecipeIngredient[] = (raw?.ingredients ?? []).map((ing) => ({
    id: ing.id,
    inventoryItemId: ing.inventoryItemId,
    quantity: toNumber(ing.quantity)
  }));
  return { ingredients };
}

export async function upsertRecipe(dto: UpsertRecipeDto): Promise<void> {
  const res = await fetch(
    `${API_URL}/services/${encodeURIComponent(dto.serviceId)}/recipe`,
    {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify(dto)
    }
  );
  return expectOk(res);
}

export async function completeExecution(executionId: string): Promise<void> {
  const res = await fetch(
    `${API_URL}/executions/${encodeURIComponent(executionId)}/complete`,
    {
      method: 'POST',
      headers: jsonHeaders
    }
  );
  return expectOk(res);
}

// -- Journal (stock-movement history) -----------------------------------------

interface RawTransaction {
  id: string;
  type: InventoryTxType;
  quantity: number | string;
  createdAt: string;
  userId?: string | null;
  inventoryItem?: { id: string; name: string; unit?: RawUnit | null } | null;
  serviceExecution?: {
    id: string;
    patientId?: string | null;
    serviceId?: string | null;
    service?: { id: string; name: string } | null;
  } | null;
}

export interface TransactionFilters {
  inventoryItemId?: string;
  serviceExecutionId?: string;
  type?: InventoryTxType;
  limit?: number;
  offset?: number;
}

export async function listTransactions(
  filters: TransactionFilters = {}
): Promise<InventoryTransaction[]> {
  const qs = new URLSearchParams();
  if (filters.inventoryItemId) qs.set('inventoryItemId', filters.inventoryItemId);
  if (filters.serviceExecutionId) qs.set('serviceExecutionId', filters.serviceExecutionId);
  if (filters.type) qs.set('type', filters.type);
  if (filters.limit != null) qs.set('limit', String(filters.limit));
  if (filters.offset != null) qs.set('offset', String(filters.offset));
  const suffix = qs.toString() ? `?${qs.toString()}` : '';

  const res = await fetch(`${API_URL}/inventory/transactions${suffix}`);
  const raw = await parse<RawTransaction[]>(res);
  return raw.map((t) => ({
    id: t.id,
    type: t.type,
    quantity: toNumber(t.quantity),
    createdAt: t.createdAt,
    userId: t.userId ?? undefined,
    itemId: t.inventoryItem?.id ?? '',
    itemName: t.inventoryItem?.name ?? '—',
    unitCode: t.inventoryItem?.unit?.code,
    serviceId: t.serviceExecution?.service?.id ?? t.serviceExecution?.serviceId ?? undefined,
    serviceName: t.serviceExecution?.service?.name,
    patientId: t.serviceExecution?.patientId ?? undefined
  }));
}

// -- Low-stock notifications (admin / manager) --------------------------------

interface RawLowStock {
  id: string;
  inventoryItemId: string;
  inventoryItem?: { id: string; name: string; unit?: RawUnit | null } | null;
  stockAtEvent: number | string;
  minStock: number | string;
  resolved: boolean;
  createdAt: string;
}

export async function listLowStock(
  resolved?: boolean
): Promise<LowStockNotification[]> {
  const suffix = resolved === undefined ? '' : `?resolved=${resolved ? 'true' : 'false'}`;
  const res = await fetch(`${API_URL}/inventory/low-stock${suffix}`);
  const raw = await parse<RawLowStock[]>(res);
  return raw.map((n) => ({
    id: n.id,
    itemId: n.inventoryItem?.id ?? n.inventoryItemId,
    itemName: n.inventoryItem?.name ?? '—',
    unitCode: n.inventoryItem?.unit?.code,
    stockAtEvent: toNumber(n.stockAtEvent),
    minStock: toNumber(n.minStock),
    resolved: n.resolved,
    createdAt: n.createdAt
  }));
}

export async function resolveLowStock(id: string): Promise<void> {
  const res = await fetch(
    `${API_URL}/inventory/low-stock/${encodeURIComponent(id)}/resolve`,
    { method: 'PATCH', headers: jsonHeaders }
  );
  return expectOk(res);
}
