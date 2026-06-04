import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InventoryService } from './inventory.service.js';
import { InsufficientStockError } from '../../../lib/errors.js';

// =============================================================================
// Unit tests for deductForServiceExecution using a hand-rolled FAKE tx object.
// No real database is involved — we only assert the deduction algorithm:
// race-safe conditional decrement, friendly insufficient-stock error, and
// idempotent journaling (P2002 → skip).
// =============================================================================

const EXECUTION_ID = '11111111-1111-1111-1111-111111111111';
const SERVICE_ID = '22222222-2222-2222-2222-222222222222';
const ITEM_ID = '33333333-3333-3333-3333-333333333333';

// Builds a fake Prisma.TransactionClient with vi.fn() mocks. Overrides let each
// test tune the behavior it cares about.
function makeFakeTx(overrides?: {
  updateManyResult?: { count: number };
  createImpl?: () => Promise<unknown>;
  itemFindUnique?: () => Promise<unknown>;
}) {
  const recipe = {
    id: 'recipe-1',
    serviceId: SERVICE_ID,
    ingredients: [
      {
        id: 'ri-1',
        recipeId: 'recipe-1',
        inventoryItemId: ITEM_ID,
        quantity: 2,
        inventoryItem: { id: ITEM_ID, name: 'Композит Filtek', currentStock: 10, minStock: 1 },
      },
    ],
  };

  const tx = {
    serviceExecution: {
      findUnique: vi.fn(async () => ({
        id: EXECUTION_ID,
        serviceId: SERVICE_ID,
        status: 'IN_PROGRESS',
      })),
    },
    serviceRecipe: {
      findUnique: vi.fn(async () => recipe),
    },
    inventoryItem: {
      updateMany: vi.fn(async () => overrides?.updateManyResult ?? { count: 1 }),
      findUnique: vi.fn(
        overrides?.itemFindUnique ??
          (async () => ({
            id: ITEM_ID,
            name: 'Композит Filtek',
            currentStock: 8,
            minStock: 1,
            unit: null,
          })),
      ),
    },
    inventoryTransaction: {
      create: vi.fn(overrides?.createImpl ?? (async () => ({ id: 'tx-1' }))),
    },
    lowStockNotification: {
      create: vi.fn(async () => ({ id: 'low-1' })),
    },
  };

  return tx;
}

describe('InventoryService.deductForServiceExecution', () => {
  let service: InventoryService;

  beforeEach(() => {
    service = new InventoryService();
  });

  it('Case 1: deducts successfully (race-safe decrement + journal)', async () => {
    const tx = makeFakeTx({
      updateManyResult: { count: 1 },
      // stock after decrement stays above minStock → no low-stock notification
      itemFindUnique: async () => ({
        id: ITEM_ID,
        name: 'Композит Filtek',
        currentStock: 8,
        minStock: 1,
        unit: null,
      }),
    });

    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      service.deductForServiceExecution(tx as any, EXECUTION_ID),
    ).resolves.toBeUndefined();

    // Conditional decrement used a `gte` guard and a `decrement` mutation.
    expect(tx.inventoryItem.updateMany).toHaveBeenCalledTimes(1);
    const call = (tx.inventoryItem.updateMany.mock.calls[0] as unknown[])[0] as {
      where: { id: string; currentStock: { gte: unknown } };
      data: { currentStock: { decrement: unknown } };
    };
    expect(call.where.id).toBe(ITEM_ID);
    expect(call.where.currentStock).toHaveProperty('gte');
    expect(call.data.currentStock).toHaveProperty('decrement');

    // Journaled the consumption.
    expect(tx.inventoryTransaction.create).toHaveBeenCalledTimes(1);
    // Stock above min → no low-stock notification.
    expect(tx.lowStockNotification.create).not.toHaveBeenCalled();
  });

  it('Case 2: throws InsufficientStockError with friendly message', async () => {
    const tx = makeFakeTx({
      updateManyResult: { count: 0 },
      itemFindUnique: async () => ({
        id: ITEM_ID,
        name: 'Композит Filtek',
        currentStock: 1.2,
        minStock: 1,
        unit: null,
      }),
    });

    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      service.deductForServiceExecution(tx as any, EXECUTION_ID),
    ).rejects.toBeInstanceOf(InsufficientStockError);

    // The user-facing (public) message is Russian per spec; Error.message holds
    // the internal English detail, so assert against `publicMessage`.
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      service.deductForServiceExecution(makeFakeTx({
        updateManyResult: { count: 0 },
        itemFindUnique: async () => ({
          id: ITEM_ID,
          name: 'Композит Filtek',
          currentStock: 1.2,
          minStock: 1,
          unit: null,
        }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any, EXECUTION_ID),
    ).rejects.toMatchObject({
      publicMessage: expect.stringContaining('Недостаточно материала: Композит Filtek'),
    });

    // Never journaled on insufficient stock.
    expect(tx.inventoryTransaction.create).not.toHaveBeenCalled();
  });

  it('Case 3: idempotent — P2002 on journal create is skipped, resolves', async () => {
    const p2002 = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    const tx = makeFakeTx({
      updateManyResult: { count: 1 },
      createImpl: async () => {
        throw p2002;
      },
    });

    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      service.deductForServiceExecution(tx as any, EXECUTION_ID),
    ).resolves.toBeUndefined();

    expect(tx.inventoryTransaction.create).toHaveBeenCalledTimes(1);
  });
});
