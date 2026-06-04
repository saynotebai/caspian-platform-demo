import { z } from 'zod';

// =============================================================================
// Zod schemas — MIRROR the backend exactly. These are the wire contract.
// Relations are ID-based only; we never persist or send names.
// =============================================================================

export const RecipeIngredientInput = z.object({
  inventoryItemId: z.string().uuid(),
  quantity: z.number().positive()
});

export type RecipeIngredientInput = z.infer<typeof RecipeIngredientInput>;

export const UpsertRecipeDto = z.object({
  serviceId: z.string().uuid(),
  ingredients: z.array(RecipeIngredientInput).max(50)
});

export type UpsertRecipeDto = z.infer<typeof UpsertRecipeDto>;

// =============================================================================
// UI types — shapes returned by the API for rendering.
// =============================================================================

export interface Unit {
  id: string;
  name: string;
  code: string;
}

export interface InventoryItem {
  id: string;
  sku: string;
  name: string;
  unitId: string;
  unit?: Unit;
  currentStock: number;
  minStock: number;
}

export interface RecipeIngredient {
  id: string;
  inventoryItemId: string;
  quantity: number;
}

export interface Recipe {
  ingredients: RecipeIngredient[];
}

export type InventoryTxType = 'CONSUMPTION' | 'RESTOCK' | 'ADJUSTMENT';

// A row of the stock-movement journal (history is fully reconstructable).
export interface InventoryTransaction {
  id: string;
  type: InventoryTxType;
  quantity: number;
  createdAt: string;
  userId?: string;
  itemId: string;
  itemName: string;
  unitCode?: string;
  serviceId?: string;
  serviceName?: string;
  patientId?: string;
}

export interface LowStockNotification {
  id: string;
  itemId: string;
  itemName: string;
  unitCode?: string;
  stockAtEvent: number;
  minStock: number;
  resolved: boolean;
  createdAt: string;
}
