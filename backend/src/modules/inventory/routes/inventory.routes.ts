import { Router } from 'express';
import * as controller from '../controller/inventory.controller.js';

// =============================================================================
// Inventory + recipe routes. Mounted at the app root in server.ts.
// =============================================================================

export const inventoryRouter: Router = Router();

inventoryRouter.get('/inventory/items', controller.listItems);
inventoryRouter.post('/inventory/items', controller.createItem);
inventoryRouter.post('/inventory/restock', controller.restock);

// Stock-movement journal (history).
inventoryRouter.get('/inventory/transactions', controller.getTransactions);

// Low-stock notifications (admin / manager).
inventoryRouter.get('/inventory/low-stock', controller.getLowStock);
inventoryRouter.patch('/inventory/low-stock/:id/resolve', controller.resolveLowStock);

inventoryRouter.get('/services/:serviceId/recipe', controller.getRecipe);
inventoryRouter.put('/services/:serviceId/recipe', controller.upsertRecipe);

export default inventoryRouter;
