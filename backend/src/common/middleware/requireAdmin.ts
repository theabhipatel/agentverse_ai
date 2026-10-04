import type { RequestHandler } from 'express';
import { eq } from 'drizzle-orm';
import { forbidden } from '../errors/index.js';
import { db } from '../../db/index.js';
import { users } from '../../db/schema.js';
import { getAuthenticatedUser } from './requireAuth.js';

/**
 * Runs after requireAuth. The role is read from the database, not from the
 * token, so revoking an admin takes effect immediately instead of at the next
 * refresh. Must never trust anything the client sends.
 */
export const requireAdmin: RequestHandler = async (req, _res, next) => {
  try {
    const { id } = getAuthenticatedUser(req);
    const [user] = await db.select({ role: users.role }).from(users).where(eq(users.id, id)).limit(1);

    if (user?.role !== 'admin') {
      next(forbidden('This area is restricted to administrators'));
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
};
