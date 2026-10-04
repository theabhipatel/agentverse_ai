import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { logger } from '../common/logger/index.js';
import { closeDatabase, db } from './index.js';

async function runMigrations(): Promise<void> {
  logger.info('Running database migrations');
  await migrate(db, { migrationsFolder: 'src/db/migrations' });
  logger.info('Migrations applied');
}

runMigrations()
  .then(async () => {
    await closeDatabase();
    process.exit(0);
  })
  .catch(async (error: unknown) => {
    logger.error({ err: error }, 'Migration failed');
    await closeDatabase();
    process.exit(1);
  });
