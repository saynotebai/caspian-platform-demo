import { z } from 'zod';

// =============================================================================
// Inventory DTO schemas. These EXACT shapes are mirrored by the frontend —
// keep them stable and validate every inbound payload against them.
// =============================================================================

export const RecipeIngredientInput = z.object({
  inventoryItemId: z.string().uuid(),
  quantity: z.number().positive(),
});

export const UpsertRecipeDto = z.object({
  serviceId: z.string().uuid(),
  ingredients: z.array(RecipeIngredientInput).max(50),
});

export const RestockDto = z.object({
  inventoryItemId: z.string().uuid(),
  quantity: z.number().positive(),
});

export const CreateInventoryItemDto = z.object({
  sku: z.string().min(1),
  name: z.string().min(1),
  unitId: z.string().uuid(),
  minStock: z.number().min(0).default(0),
  currentStock: z.number().min(0).default(0),
});

// Stock-movement journal query. Query-string values arrive as strings, so
// limit/offset are coerced. All filters are optional.
export const TransactionHistoryQuery = z.object({
  inventoryItemId: z.string().uuid().optional(),
  serviceExecutionId: z.string().uuid().optional(),
  type: z.enum(['CONSUMPTION', 'RESTOCK', 'ADJUSTMENT']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// Low-stock notification feed query (admin/manager). `resolved` arrives as a
// query string, so it is parsed from 'true' | 'false'.
export const LowStockQuery = z.object({
  resolved: z.enum(['true', 'false']).optional(),
});

export type RecipeIngredientInput = z.infer<typeof RecipeIngredientInput>;
export type UpsertRecipeDto = z.infer<typeof UpsertRecipeDto>;
export type RestockDto = z.infer<typeof RestockDto>;
export type CreateInventoryItemDto = z.infer<typeof CreateInventoryItemDto>;
export type TransactionHistoryQuery = z.infer<typeof TransactionHistoryQuery>;
export type LowStockQuery = z.infer<typeof LowStockQuery>;
