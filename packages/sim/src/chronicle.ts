/**
 * The village's public event log (spec section 4's `chronicle` table and
 * section 1's glossary: "the village's public event log, written by the
 * sim"). An in-memory append-only list for now; `db` will persist it.
 */

export interface ChronicleEntry {
  minute: number;
  kind: string;
  text: string;
  actors: readonly string[];
  /** 1 (minor) to 10 (momentous). */
  importance: number;
  public: boolean;
}

export type Chronicle = readonly ChronicleEntry[];

export function appendChronicle(chronicle: Chronicle, entry: ChronicleEntry): Chronicle {
  return [...chronicle, entry];
}

export function publicChronicle(chronicle: Chronicle): Chronicle {
  return chronicle.filter((entry) => entry.public);
}
