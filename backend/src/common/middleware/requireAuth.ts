import type { Request, RequestHandler } from 'express';
import { unauthorized } from '../errors/index.js';
import type { AuthenticatedUser } from '../types/auth.js';
import { verifyAccessToken } from '../utils/jwt.js';

export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next(unauthorized('Authentication required'));
    return;
  }

  try {
    const payload = verifyAccessToken(header.slice('Bearer '.length).trim());
    req.user = { id: payload.userId, email: payload.email };
    next();
  } catch (error) {
    next(error);
  }
};

/** Guarantees a typed user on routes behind requireAuth. */
export function getAuthenticatedUser(req: Request): AuthenticatedUser {
  if (!req.user) {
    throw unauthorized('Authentication required');
  }
  return req.user;
}
