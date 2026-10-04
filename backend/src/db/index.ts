import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { config } from '../config/env.js';
import * as schema from './schema.js';

export const pool = new Pool({ connectionString: config.db.url });

export const db = drizzle(pool, { schema });

export async function connectDatabase(): Promise<void> {
  await pool.query('select 1');
}

export async function closeDatabase(): Promise<void> {
  await pool.end();
}
