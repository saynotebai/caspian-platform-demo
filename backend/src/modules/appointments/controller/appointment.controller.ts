import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { appointmentService } from '../service/appointment.service.js';
import { ValidationError } from '../../../lib/errors.js';

// =============================================================================
// Thin appointments controller. Validates the execution id, then delegates to
// the service which performs the atomic complete + deduct transaction.
// =============================================================================

const executionIdParam = z.string().uuid();

export async function completeServiceExecution(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = executionIdParam.safeParse(req.params.id);
    if (!id.success) {
      return next(new ValidationError('Некорректный идентификатор выполнения услуги.'));
    }
    const actorUserId = typeof req.body?.userId === 'string' ? req.body.userId : undefined;
    const data = await appointmentService.completeServiceExecution(id.data, actorUserId);
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
}
