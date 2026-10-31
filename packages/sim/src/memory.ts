/**
 * The "memories" layer of spec section 7's memory table: moments that
 * mattered, importance 1-10, made by the `remember` tool (and, later, a
 * nightly digest this doesn't build yet). The "owner file" is the same
 * model with `about: "owner"` - no separate structure needed, since it's
 * exactly "what the owner has told villagers", a memory about the owner.
 *
 * The diary layer (today's events, regenerated hourly, one day deep)
 * isn't built: the sim only advances by whole days, not hours, so an
 * hourly diary isn't meaningfully buildable without that granularity.
 */

import { MINUTES_PER_DAY } from './calendar.js';

export interface Memory {
  id: number;
  villagerId: string;
  minute: number;
  text: string;
  /** 1-10 (spec section 7). */
  importance: number;
  /** Who/what this is about - "owner" for the owner file; null otherwise. */
  about: string | null;
  lastRecalledMinute: number | null;
}

export interface MemoryState {
  memories: readonly Memory[];
  nextId: number;
}

export function createMemoryState(): MemoryState {
  return { memories: [], nextId: 1 };
}

const MIN_IMPORTANCE = 1;
const MAX_IMPORTANCE = 10;

export function addMemory(
  state: MemoryState,
  entry: {
    villagerId: string;
    minute: number;
    text: string;
    importance: number;
    about?: string | null;
  },
): MemoryState {
  const importance = Math.min(
    MAX_IMPORTANCE,
    Math.max(MIN_IMPORTANCE, Math.round(entry.importance)),
  );
  const memory: Memory = {
    id: state.nextId,
    villagerId: entry.villagerId,
    minute: entry.minute,
    text: entry.text,
    importance,
    about: entry.about ?? null,
    lastRecalledMinute: null,
  };
  return { memories: [...state.memories, memory], nextId: state.nextId + 1 };
}

/** A memory halves in recall weight every this many days, regardless of importance. */
const RECALL_HALF_LIFE_DAYS = 14;

function memoryScore(memory: Memory, nowMinute: number): number {
  const daysSince = Math.max(0, (nowMinute - memory.minute) / MINUTES_PER_DAY);
  const recency = Math.pow(0.5, daysSince / RECALL_HALF_LIFE_DAYS);
  return memory.importance * recency;
}

/**
 * The top memories for one villager, by recency x importance (spec
 * section 7). Not weighted by "match to the topic and the people
 * present" - that needs semantic matching the sim can't do
 * deterministically, so it's left out rather than faked.
 */
export function topMemoriesFor(
  state: MemoryState,
  villagerId: string,
  nowMinute: number,
  limit = 6,
): readonly Memory[] {
  return state.memories
    .filter((memory) => memory.villagerId === villagerId)
    .slice()
    .sort((a, b) => memoryScore(b, nowMinute) - memoryScore(a, nowMinute))
    .slice(0, limit);
}
