import { eq } from 'drizzle-orm';
import type { Database } from './client.js';
import * as schema from './schema.js';

/**
 * The owner's settings. See `schema.ts`'s comment on the `settings`
 * table: this project's owner explicitly chose to store the API key in
 * the database rather than the OS keychain the spec names, a deliberate
 * session decision.
 */
export interface Settings {
  deepseekApiKey: string | null;
  /** Whether the Mayor takes a model turn each village morning (spends money on the key). */
  mayorAutonomy: boolean;
  /** Spec section 16's monthly ceiling in US dollars, or null until the owner sets one. */
  monthlyCeilingUsd: number | null;
}

export const DEFAULT_SETTINGS: Settings = {
  deepseekApiKey: null,
  mayorAutonomy: false,
  monthlyCeilingUsd: null,
};

const SETTINGS_ROW_ID = 1;

/** The owner's settings, or the defaults if nothing has been saved yet. */
export async function getSettings(db: Database): Promise<Settings> {
  const row = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.id, SETTINGS_ROW_ID))
    .get();
  if (!row) {
    return DEFAULT_SETTINGS;
  }
  return {
    deepseekApiKey: row.deepseekApiKey,
    mayorAutonomy: row.mayorAutonomy,
    monthlyCeilingUsd: row.monthlyCeilingUsd,
  };
}

/** Saves some settings, keeping the rest as they were. */
export async function saveSettings(db: Database, changes: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings(db)), ...changes };
  await db.delete(schema.settings).where(eq(schema.settings.id, SETTINGS_ROW_ID));
  await db.insert(schema.settings).values({ id: SETTINGS_ROW_ID, ...next });
  return next;
}
