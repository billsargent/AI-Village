import { eq } from 'drizzle-orm';
import type { Database } from './client.js';
import * as schema from './schema.js';

/**
 * The owner's settings - currently just the DeepSeek API key. See
 * `schema.ts`'s comment on the `settings` table: this project's owner
 * explicitly chose to store it in the database rather than the OS
 * keychain the spec names, a deliberate session decision.
 */
export interface Settings {
  deepseekApiKey: string | null;
}

const SETTINGS_ROW_ID = 1;

/** The owner's settings, or all-null defaults if nothing has been saved yet. */
export async function getSettings(db: Database): Promise<Settings> {
  const row = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.id, SETTINGS_ROW_ID))
    .get();
  return { deepseekApiKey: row?.deepseekApiKey ?? null };
}

/** Replaces the whole settings row. */
export async function saveSettings(db: Database, settings: Settings): Promise<void> {
  await db.delete(schema.settings).where(eq(schema.settings.id, SETTINGS_ROW_ID));
  await db.insert(schema.settings).values({ id: SETTINGS_ROW_ID, ...settings });
}
