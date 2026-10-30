import { existsSync, copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createClient, type Client } from '@libsql/client';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import { migrate as drizzleMigrate } from 'drizzle-orm/libsql/migrator';
import * as schema from './schema.js';

export type Database = LibSQLDatabase<typeof schema>;

export interface OpenDatabase {
  db: Database;
  client: Client;
}

/**
 * Opens (creating if needed) the SQLite file at `dbPath` and applies any
 * pending migrations. If a database already exists, it's copied to
 * `<dbPath>.bak` first (spec section 4: "On start the server backs up the
 * database, then migrates"). Call `closeDatabase` with the returned
 * client when done, before removing the file.
 */
export async function openAndMigrate(
  dbPath: string,
  migrationsFolder: string,
): Promise<OpenDatabase> {
  mkdirSync(dirname(dbPath), { recursive: true });
  if (existsSync(dbPath)) {
    copyFileSync(dbPath, `${dbPath}.bak`);
  }

  const client: Client = createClient({ url: `file:${dbPath}` });
  const db = drizzle(client, { schema });
  await drizzleMigrate(db, { migrationsFolder });
  return { db, client };
}

export function closeDatabase(client: Client): void {
  client.close();
}

export function migrationsFolderPath(): string {
  return join(import.meta.dirname, '..', 'migrations');
}
