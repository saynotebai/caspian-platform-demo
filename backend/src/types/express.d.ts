import type { AuthUser } from '../lib/auth.js';

// Augment Express' Request with the authenticated user attached by the
// `authenticate` middleware.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthUser;
    }
  }
}

export {};
