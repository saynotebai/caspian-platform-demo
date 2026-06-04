import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { AuthError, ForbiddenError } from './errors.js';

// =============================================================================
// Authentication & authorization.
//
//   authenticate   — soft: if a Bearer token is present it is verified and the
//                    decoded user is attached to req.auth; a malformed/expired
//                    token is rejected (401). A missing token is allowed through
//                    so per-route guards decide whether auth is required.
//   requireAuth    — 401 unless req.auth is set.
//   requireRole    — 401 unless authenticated, 403 unless the role is allowed.
//
// Identity comes from the JWT claims only (userId + role) — no DB lookup and no
// User model, consistent with InventoryTransaction.userId being a plain id.
// =============================================================================

export const ROLES = ['ADMIN', 'MANAGER', 'DOCTOR', 'RECEPTION'] as const;
export type Role = (typeof ROLES)[number];

export interface AuthUser {
  userId: string;
  role: Role;
}

// JWT payload contract. `sub` carries the user id (standard claim).
const TokenClaims = z.object({
  sub: z.string().min(1),
  role: z.enum(ROLES),
});

function getSecret(): string {
  const secret = process.env.AUTH_JWT_SECRET;
  if (!secret) {
    // Fail loudly server-side; never leak this to clients.
    throw new Error('AUTH_JWT_SECRET is not configured');
  }
  return secret;
}

// Issue a token (used by a real login flow / tests / local dev).
export function signToken(user: AuthUser, expiresIn: jwt.SignOptions['expiresIn'] = '12h'): string {
  return jwt.sign({ role: user.role }, getSecret(), { subject: user.userId, expiresIn });
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return next(); // no credentials → let route guards decide
  }

  const token = header.slice('Bearer '.length).trim();
  try {
    const decoded = jwt.verify(token, getSecret());
    const claims = TokenClaims.safeParse(decoded);
    if (!claims.success) {
      return next(new AuthError('Недействительный токен.'));
    }
    req.auth = { userId: claims.data.sub, role: claims.data.role };
    return next();
  } catch (err) {
    // jwt errors (expired/invalid signature) → 401, details kept internal.
    return next(new AuthError('Сессия недействительна или истекла.', (err as Error).message));
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.auth) return next(new AuthError());
  next();
}

export function requireRole(...allowed: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) return next(new AuthError());
    if (!allowed.includes(req.auth.role)) return next(new ForbiddenError());
    next();
  };
}
