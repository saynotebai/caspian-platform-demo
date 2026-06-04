import { Prisma, PrismaClient } from '@prisma/client';
import prisma from '../../../lib/prisma.js';
import type { CreateInventoryItemDto, UpsertRecipeDto } from '../types/inventory.types.js';

// A client that can be either the top-level PrismaClient or a transaction
// client handed to us inside `prisma.$transaction(...)`.
export type Db = Prisma.TransactionClient | PrismaClient;

// =============================================================================
// Thin data-access helpers. No business rules here — just typed Prisma calls.
// Every helper accepts an optional `db` so it can participate in a transaction.
// =============================================================================

export function getServiceExecutionById(serviceExecutionId: string, db: Db = prisma) {
  return db.serviceExecution.findUnique({
    where: { id: serviceExecutionId },
    select: { id: true, serviceId: true, status: true },
  });
}

export function getRecipeByServiceId(serviceId: string, db: Db = prisma) {
  return db.serviceRecipe.findUnique({
    where: { serviceId },
    include: {
      ingredients: {
        include: { inventoryItem: true },
      },
    },
  });
}

export function listItems(db: Db = prisma) {
  return db.inventoryItem.findMany({
    orderBy: { name: 'asc' },
    include: { unit: true },
  });
}

export function getItemById(id: string, db: Db = prisma) {
  return db.inventoryItem.findUnique({ where: { id }, include: { unit: true } });
}

export function createItem(dto: CreateInventoryItemDto, db: Db = prisma) {
  return db.inventoryItem.create({
    data: {
      sku: dto.sku,
      name: dto.name,
      unitId: dto.unitId,
      minStock: new Prisma.Decimal(dto.minStock),
      currentStock: new Prisma.Decimal(dto.currentStock),
    },
    include: { unit: true },
  });
}

// Race-safe conditional decrement. Only succeeds when there is enough stock.
// Returns the number of rows affected (0 → insufficient stock).
export function conditionalDecrement(
  inventoryItemId: string,
  quantity: Prisma.Decimal,
  db: Db,
) {
  return db.inventoryItem.updateMany({
    where: { id: inventoryItemId, currentStock: { gte: quantity } },
    data: { currentStock: { decrement: quantity }, updatedAt: new Date() },
  });
}

export function incrementStock(
  inventoryItemId: string,
  quantity: Prisma.Decimal,
  db: Db = prisma,
) {
  return db.inventoryItem.update({
    where: { id: inventoryItemId },
    data: { currentStock: { increment: quantity }, updatedAt: new Date() },
    include: { unit: true },
  });
}

export function createConsumptionTransaction(
  args: {
    inventoryItemId: string;
    serviceExecutionId: string;
    userId?: string;
    quantity: Prisma.Decimal;
  },
  db: Db,
) {
  return db.inventoryTransaction.create({
    data: {
      inventoryItemId: args.inventoryItemId,
      serviceExecutionId: args.serviceExecutionId,
      userId: args.userId ?? null,
      quantity: args.quantity,
      type: 'CONSUMPTION',
    },
  });
}

export function createRestockTransaction(
  args: { inventoryItemId: string; userId?: string; quantity: Prisma.Decimal },
  db: Db = prisma,
) {
  return db.inventoryTransaction.create({
    data: {
      inventoryItemId: args.inventoryItemId,
      serviceExecutionId: null,
      userId: args.userId ?? null,
      quantity: args.quantity,
      type: 'RESTOCK',
    },
  });
}

export function createLowStockNotification(
  args: { inventoryItemId: string; stockAtEvent: Prisma.Decimal; minStock: Prisma.Decimal },
  db: Db,
) {
  return db.lowStockNotification.create({
    data: {
      inventoryItemId: args.inventoryItemId,
      stockAtEvent: args.stockAtEvent,
      minStock: args.minStock,
    },
  });
}

// Replace a service's recipe ingredients transactionally: upsert the recipe
// row, drop existing ingredients, then recreate them.
export async function upsertRecipe(dto: UpsertRecipeDto, db: Db = prisma) {
  const recipe = await db.serviceRecipe.upsert({
    where: { serviceId: dto.serviceId },
    create: { serviceId: dto.serviceId },
    update: {},
  });

  await db.recipeIngredient.deleteMany({ where: { recipeId: recipe.id } });

  if (dto.ingredients.length > 0) {
    await db.recipeIngredient.createMany({
      data: dto.ingredients.map((ing) => ({
        recipeId: recipe.id,
        inventoryItemId: ing.inventoryItemId,
        quantity: new Prisma.Decimal(ing.quantity),
      })),
    });
  }

  return getRecipeByServiceId(dto.serviceId, db);
}

export function countItemsByIds(ids: string[], db: Db = prisma) {
  return db.inventoryItem.count({ where: { id: { in: ids } } });
}

// Stock-movement journal. Joins the material (+unit) and, for consumptions, the
// execution → service + patient so history is fully reconstructable.
export function listTransactions(
  filters: {
    inventoryItemId?: string;
    serviceExecutionId?: string;
    type?: 'CONSUMPTION' | 'RESTOCK' | 'ADJUSTMENT';
    limit: number;
    offset: number;
  },
  db: Db = prisma,
) {
  return db.inventoryTransaction.findMany({
    where: {
      inventoryItemId: filters.inventoryItemId,
      serviceExecutionId: filters.serviceExecutionId,
      type: filters.type,
    },
    orderBy: { createdAt: 'desc' },
    take: filters.limit,
    skip: filters.offset,
    include: {
      inventoryItem: { include: { unit: true } },
      serviceExecution: {
        select: {
          id: true,
          patientId: true,
          serviceId: true,
          service: { select: { id: true, name: true } },
        },
      },
    },
  });
}

export function listLowStockNotifications(
  filters: { resolved?: boolean },
  db: Db = prisma,
) {
  return db.lowStockNotification.findMany({
    where: { resolved: filters.resolved },
    orderBy: { createdAt: 'desc' },
    include: { inventoryItem: { include: { unit: true } } },
  });
}

export function resolveLowStockNotification(id: string, db: Db = prisma) {
  return db.lowStockNotification.update({
    where: { id },
    data: { resolved: true },
    include: { inventoryItem: { include: { unit: true } } },
  });
}
