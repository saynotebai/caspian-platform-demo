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

export type RecipeIngredientInput = z.infer<typeof RecipeIngredientInput>;
export type UpsertRecipeDto = z.infer<typeof UpsertRecipeDto>;
export type RestockDto = z.infer<typeof RestockDto>;
export type CreateInventoryItemDto = z.infer<typeof CreateInventoryItemDto>;
