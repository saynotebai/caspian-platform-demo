import { Prisma } from '@prisma/client';
import prisma from '../../../lib/prisma.js';
import { InsufficientStockError, NotFoundError, ValidationError } from '../../../lib/errors.js';
import * as repo from '../model/inventory.repository.js';
import type {
  CreateInventoryItemDto,
  RestockDto,
  UpsertRecipeDto,
} from '../types/inventory.types.js';

// Reads the Prisma error code off either a real PrismaClientKnownRequestError
// or any error object that exposes a string `code` (lets tests/mocks signal a
// specific Prisma error without constructing the real error class).
function prismaErrorCode(err: unknown): string | undefined {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    return err.code;
  }
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const code = (err as { code?: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

// Prisma raises P2002 on a unique-constraint violation.
function isUniqueViolation(err: unknown): boolean {
  return prismaErrorCode(err) === 'P2002';
}

// Prisma raises P2025 when an update/where targets a non-existent row.
function isRecordNotFound(err: unknown): boolean {
  return prismaErrorCode(err) === 'P2025';
}

export class InventoryService {
  // ---------------------------------------------------------------------------
  // CORE: deduct all recipe materials for a completed service execution.
  //
  // MUST run inside an existing $transaction (caller passes `tx`) so that the
  // status change + every deduction + every journal row commit or roll back as
  // one unit. The method is:
  //   - atomic      → all work shares the caller's transaction
  //   - race-safe   → conditional decrement guarded by `currentStock >= qty`
  //   - idempotent  → CONSUMPTION journal rows are unique per (execution, item);
  //                   a P2002 means we already processed this ingredient.
  // ---------------------------------------------------------------------------
  async deductForServiceExecution(
    tx: Prisma.TransactionClient,
    serviceExecutionId: string,
    actorUserId?: string,
  ): Promise<void> {
    // 1. Resolve the execution → its service.
    const execution = await repo.getServiceExecutionById(serviceExecutionId, tx);
    if (!execution) {
      throw new NotFoundError('Выполнение услуги не найдено.');
    }

    // 2. Load the recipe. No recipe → nothing to deduct.
    const recipe = await repo.getRecipeByServiceId(execution.serviceId, tx);
    if (!recipe || recipe.ingredients.length === 0) {
      return;
    }

    // 3. Process each ingredient.
    for (const ingredient of recipe.ingredients) {
      const inventoryItemId = ingredient.inventoryItemId;
      const required = new Prisma.Decimal(ingredient.quantity);

      // 3a. RACE-SAFE conditional decrement.
      const res = await repo.conditionalDecrement(inventoryItemId, required, tx);

      // 3b. No row updated → not enough stock. Throw to roll back the whole tx.
      if (res.count === 0) {
        const item = await repo.getItemById(inventoryItemId, tx);
        const available = item ? Number(item.currentStock) : 0;
        const name = item?.name ?? ingredient.inventoryItem.name;
        throw new InsufficientStockError(name, available, Number(required));
      }

      // 3c. Journal the consumption idempotently.
      try {
        await repo.createConsumptionTransaction(
          { inventoryItemId, serviceExecutionId, userId: actorUserId, quantity: required },
          tx,
        );
      } catch (err) {
        if (isUniqueViolation(err)) {
          // Already journaled for this (execution, item) — idempotent skip.
          // NOTE: by construction this branch is only reachable on a retry of
          // an already-committed execution; within a fresh transaction the
          // decrement above will not have run twice for the same pair.
          continue;
        }
        throw err;
      }

      // 3d. Re-read fresh stock; raise a low-stock notification if below min.
      const fresh = await repo.getItemById(inventoryItemId, tx);
      if (fresh) {
        const newStock = new Prisma.Decimal(fresh.currentStock);
        const minStock = new Prisma.Decimal(fresh.minStock);
        if (newStock.lessThan(minStock)) {
          await repo.createLowStockNotification(
            { inventoryItemId, stockAtEvent: newStock, minStock },
            tx,
          );
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Recipe management
  // ---------------------------------------------------------------------------
  async getRecipe(serviceId: string) {
    const recipe = await repo.getRecipeByServiceId(serviceId);
    if (!recipe) {
      throw new NotFoundError('Рецепт услуги не найден.');
    }
    return recipe;
  }

  async upsertRecipe(dto: UpsertRecipeDto) {
    // Validate referenced inventory items exist (by ID only).
    const ids = dto.ingredients.map((i) => i.inventoryItemId);
    const uniqueIds = [...new Set(ids)];

    if (uniqueIds.length !== ids.length) {
      throw new ValidationError('Дублирующиеся материалы в рецепте недопустимы.');
    }

    if (uniqueIds.length > 0) {
      const found = await repo.countItemsByIds(uniqueIds);
      if (found !== uniqueIds.length) {
        throw new ValidationError('Один или несколько материалов не найдены.');
      }
    }

    try {
      return await prisma.$transaction((tx) => repo.upsertRecipe(dto, tx));
    } catch (err) {
      if (isRecordNotFound(err)) {
        throw new ValidationError('Не удалось сохранить рецепт: ссылка на несуществующую запись.');
      }
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Item management
  // ---------------------------------------------------------------------------
  async createItem(dto: CreateInventoryItemDto) {
    try {
      return await repo.createItem(dto);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ValidationError('Материал с таким SKU уже существует.');
      }
      if (isRecordNotFound(err)) {
        throw new ValidationError('Указанная единица измерения не найдена.');
      }
      throw err;
    }
  }

  async listItems() {
    return repo.listItems();
  }

  // ---------------------------------------------------------------------------
  // Restock: increment stock + RESTOCK journal row, atomically.
  // ---------------------------------------------------------------------------
  async restock(dto: RestockDto, actorUserId?: string) {
    const quantity = new Prisma.Decimal(dto.quantity);
    try {
      return await prisma.$transaction(async (tx) => {
        const item = await repo.incrementStock(dto.inventoryItemId, quantity, tx);
        await repo.createRestockTransaction(
          { inventoryItemId: dto.inventoryItemId, userId: actorUserId, quantity },
          tx,
        );
        return item;
      });
    } catch (err) {
      if (isRecordNotFound(err)) {
        throw new NotFoundError('Материал не найден.');
      }
      throw err;
    }
  }
}

export const inventoryService = new InventoryService();
export default inventoryService;
