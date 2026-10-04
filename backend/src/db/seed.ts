import { eq } from 'drizzle-orm';
import { logger } from '../common/logger/index.js';
import { hashPassword } from '../common/utils/password.js';
import { config } from '../config/env.js';
import { closeDatabase, db } from './index.js';
import { users } from './schema.js';

/**
 * Creates the administrator described by ADMIN_EMAIL and ADMIN_PASSWORD.
 * Runs on every boot and does nothing once that account exists, so an existing
 * password is never reset behind the user's back. The built in agents are not
 * seeded here: migration 0009 created them once, and only an admin changes them.
 */
async function seed(): Promise<void> {
  if (!config.admin.enabled) {
    logger.info('ADMIN_EMAIL is not set, skipping seed');
    return;
  }

  const email = config.admin.email.toLowerCase();
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  if (existing) {
    logger.info({ email }, 'Administrator already exists, nothing to seed');
    return;
  }

  await db.insert(users).values({
    email,
    name: config.admin.name,
    passwordHash: await hashPassword(config.admin.password),
    role: 'admin',
  });
  logger.info({ email }, 'Administrator created');
}

seed()
  .then(async () => {
    await closeDatabase();
    process.exit(0);
  })
  .catch(async (error: unknown) => {
    logger.error({ err: error }, 'Seeding failed');
    await closeDatabase();
    process.exit(1);
  });
