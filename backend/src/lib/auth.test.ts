import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { signToken, authenticate, requireAuth, requireRole, type AuthUser } from './auth.js';
import { AuthError, ForbiddenError } from './errors.js';

// =============================================================================
// Auth middleware unit tests. Plain req/res/next stubs — no HTTP server.
// =============================================================================

const SECRET = 'test-secret';

beforeEach(() => {
  process.env.AUTH_JWT_SECRET = SECRET;
});

function mock(headers: Record<string, string> = {}, auth?: AuthUser) {
  const req = { headers, auth } as unknown as Request;
  const res = {} as Response;
  const next = vi.fn();
  return { req, res, next };
}

describe('authenticate', () => {
  it('attaches req.auth for a valid Bearer token', () => {
    const token = signToken({ userId: 'u-1', role: 'MANAGER' });
    const { req, res, next } = mock({ authorization: `Bearer ${token}` });

    authenticate(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.auth).toEqual({ userId: 'u-1', role: 'MANAGER' });
  });

  it('passes through when no token is present (req.auth stays undefined)', () => {
    const { req, res, next } = mock();

    authenticate(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.auth).toBeUndefined();
  });

  it('rejects a malformed token with AuthError (401)', () => {
    const { req, res, next } = mock({ authorization: 'Bearer not-a-jwt' });

    authenticate(req, res, next);

    expect(next.mock.calls[0]?.[0]).toBeInstanceOf(AuthError);
  });
});

describe('requireRole / requireAuth', () => {
  it('allows an authorized role', () => {
    const { req, res, next } = mock({}, { userId: 'u-1', role: 'ADMIN' });
    requireRole('ADMIN', 'MANAGER')(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('forbids a disallowed role with ForbiddenError (403)', () => {
    const { req, res, next } = mock({}, { userId: 'u-1', role: 'DOCTOR' });
    requireRole('ADMIN', 'MANAGER')(req, res, next);
    expect(next.mock.calls[0]?.[0]).toBeInstanceOf(ForbiddenError);
  });

  it('requireAuth rejects an unauthenticated request with AuthError (401)', () => {
    const { req, res, next } = mock();
    requireAuth(req, res, next);
    expect(next.mock.calls[0]?.[0]).toBeInstanceOf(AuthError);
  });
});
