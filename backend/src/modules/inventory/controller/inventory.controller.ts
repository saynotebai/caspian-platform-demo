import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { inventoryService } from '../service/inventory.service.js';
import {
  CreateInventoryItemDto,
  LowStockQuery,
  RestockDto,
  TransactionHistoryQuery,
  UpsertRecipeDto,
} from '../types/inventory.types.js';
import { ValidationError } from '../../../lib/errors.js';

// =============================================================================
// Thin inventory controllers. Parse + validate input with the Zod DTOs, then
// delegate to the service. All business logic lives in the service layer.
// On any error we forward to the central error handler via next(err).
// =============================================================================

const serviceIdParam = z.string().uuid();

export async function listItems(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await inventoryService.listItems();
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
}

export async function createItem(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = CreateInventoryItemDto.safeParse(req.body);
    if (!parsed.success) {
      return next(new ValidationError('Некорректные данные материала.'));
    }
    const data = await inventoryService.createItem(parsed.data);
    res.status(201).json({ ok: true, data });
  } catch (err) {
    next(err);
  }
}

export async function restock(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = RestockDto.safeParse(req.body);
    if (!parsed.success) {
      return next(new ValidationError('Некорректные данные пополнения.'));
    }
    const actorUserId = typeof req.body?.userId === 'string' ? req.body.userId : undefined;
    const data = await inventoryService.restock(parsed.data, actorUserId);
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getRecipe(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const serviceId = serviceIdParam.safeParse(req.params.serviceId);
    if (!serviceId.success) {
      return next(new ValidationError('Некорректный идентификатор услуги.'));
    }
    const data = await inventoryService.getRecipe(serviceId.data);
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
}

export async function upsertRecipe(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const serviceId = serviceIdParam.safeParse(req.params.serviceId);
    if (!serviceId.success) {
      return next(new ValidationError('Некорректный идентификатор услуги.'));
    }
    // serviceId comes from the route param and is authoritative.
    const parsed = UpsertRecipeDto.safeParse({ ...req.body, serviceId: serviceId.data });
    if (!parsed.success) {
      return next(new ValidationError('Некорректные данные рецепта.'));
    }
    const data = await inventoryService.upsertRecipe(parsed.data);
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getTransactions(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = TransactionHistoryQuery.safeParse(req.query);
    if (!parsed.success) {
      return next(new ValidationError('Некорректные параметры журнала.'));
    }
    const data = await inventoryService.getTransactionHistory(parsed.data);
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getLowStock(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = LowStockQuery.safeParse(req.query);
    if (!parsed.success) {
      return next(new ValidationError('Некорректные параметры фильтра.'));
    }
    const data = await inventoryService.listLowStockNotifications(parsed.data);
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
}

export async function resolveLowStock(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = serviceIdParam.safeParse(req.params.id);
    if (!id.success) {
      return next(new ValidationError('Некорректный идентификатор уведомления.'));
    }
    const data = await inventoryService.resolveLowStockNotification(id.data);
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
}
