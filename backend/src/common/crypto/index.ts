import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { config } from '../../config/env.js';

/**
 * AES-256-GCM for the provider API keys kept in the database. GCM is
 * authenticated, so a tampered row fails to decrypt instead of returning
 * rubbish that would then be sent to a provider.
 *
 * The cipher key is the SHA-256 of ENCRYPTION_KEY, so that variable can be any
 * random string. Changing it makes every stored key unreadable, and they have
 * to be entered again.
 */
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

const cipherKey = createHash('sha256').update(config.encryption.key).digest();

/** Returns iv.tag.ciphertext, each part base64url, safe to store as text. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, cipherKey, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.');
}

export function decryptSecret(value: string): string {
  const [iv, tag, encrypted] = value.split('.').map((part) => Buffer.from(part, 'base64url'));
  if (!iv || !tag || !encrypted) {
    throw new Error('Stored secret is malformed');
  }

  const decipher = createDecipheriv(ALGORITHM, cipherKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

/** What the admin sees of a key: the last few characters, never the whole thing. */
export function lastCharacters(secret: string, count = 6): string {
  return secret.slice(-count);
}
