import { createHash } from 'node:crypto';

/** Refresh tokens are stored as a hash so a leaked database row cannot be replayed. */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
