import { desc, eq } from 'drizzle-orm';
import type { Database } from './client.js';
import * as schema from './schema.js';

/** One line of a chat with a villager. Mirrors `@ai-village/agent`'s `ChatLine`. */
export interface ChatLineRow {
  from: 'owner' | 'villager';
  text: string;
  /** Wall-clock milliseconds. */
  at: number;
}

/** Adds lines to a villager's conversation with the owner. */
export async function appendChatLines(
  db: Database,
  villagerId: string,
  lines: readonly ChatLineRow[],
): Promise<void> {
  if (lines.length > 0) {
    await db
      .insert(schema.chatLines)
      .values(
        lines.map((line) => ({ villagerId, speaker: line.from, text: line.text, at: line.at })),
      );
  }
}

/** The last `limit` lines of a villager's conversation with the owner, oldest first. */
export async function loadChatLines(
  db: Database,
  villagerId: string,
  limit: number,
): Promise<ChatLineRow[]> {
  const rows = await db
    .select()
    .from(schema.chatLines)
    .where(eq(schema.chatLines.villagerId, villagerId))
    .orderBy(desc(schema.chatLines.id))
    .limit(limit)
    .all();
  return rows.reverse().map((row) => ({
    from: row.speaker === 'owner' ? 'owner' : 'villager',
    text: row.text,
    at: row.at,
  }));
}
