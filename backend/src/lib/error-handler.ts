import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from './errors.js';

// Central Express error middleware. Must be mounted LAST, after all routers.
//
// Contract:
//  - AppError  → use its httpStatus + publicMessage (already client-safe).
//  - ZodError  → 400 with a generic validation message (no field internals).
//  - anything else → log the real error server-side, return an opaque 500.
//    We NEVER leak DB/internal details to the client.
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.httpStatus).json({ ok: false, message: err.publicMessage });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({ ok: false, message: 'Некорректные данные запроса.' });
    return;
  }

  // Unknown / unexpected error: log internally, expose nothing.
  console.error('[error-handler] Unhandled error:', err);
  res.status(500).json({
    ok: false,
    message: 'Внутренняя ошибка сервера. Попробуйте позже.',
  });
}

export default errorHandler;
