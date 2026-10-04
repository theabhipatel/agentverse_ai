import type { AuthenticatedUser } from './auth.js';

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      /** Set by requireAuth from the verified access token. Never from client input. */
      user?: AuthenticatedUser;
    }
  }
}

export {};
