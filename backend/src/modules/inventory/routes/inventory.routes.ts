import { Router } from 'express';
import * as controller from '../controller/inventory.controller.js';
import { requireAuth, requireRole } from '../../../lib/auth.js';

// =============================================================================
// Inventory + recipe routes. Mounted under /api in server.ts.
//   - Reads (items, recipe): any authenticated user.
//   - Stock mutations, recipe editing, journal & low-stock: ADMIN / MANAGER.
// =============================================================================

export const inventoryRouter: Router = Router();
const manager = requireRole('ADMIN', 'MANAGER');

inventoryRouter.get('/inventory/items', requireAuth, controller.listItems);
inventoryRouter.post('/inventory/items', manager, controller.createItem);
inventoryRouter.post('/inventory/restock', manager, controller.restock);

// Stock-movement journal (history) — ADMIN / MANAGER.
inventoryRouter.get('/inventory/transactions', manager, controller.getTransactions);

// Low-stock notifications — ADMIN / MANAGER.
inventoryRouter.get('/inventory/low-stock', manager, controller.getLowStock);
inventoryRouter.patch('/inventory/low-stock/:id/resolve', manager, controller.resolveLowStock);

inventoryRouter.get('/services/:serviceId/recipe', requireAuth, controller.getRecipe);
inventoryRouter.put('/services/:serviceId/recipe', manager, controller.upsertRecipe);

export default inventoryRouter;
