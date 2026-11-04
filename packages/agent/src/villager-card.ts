/**
 * Spec section 14's villager card: "portrait, what they're doing and
 * where, needs bars, mood, traits, likes, top 5 relationships, today's
 * diary, promises to the owner." This is the data for it, read straight
 * from the sim state, so it's always the truth.
 *
 * Left out rather than faked: traits and likes (the sim doesn't give
 * villagers any yet) and the diary (nothing writes one). Where they are
 * comes from the map's routine in the browser, not from here.
 */

import {
  getRelationship,
  labelFor,
  MINUTES_PER_DAY,
  moodFromNeeds,
  topMemoriesFor,
  type Needs,
  type RelationshipLabel,
  type VillageState,
} from '@ai-village/sim';

export interface VillagerCardRelationship {
  villagerId: string;
  label: RelationshipLabel;
  /** -100 to 100. */
  affinity: number;
  /** 0 to 100. */
  familiarity: number;
}

export interface VillagerCardData {
  id: string;
  tradeId: string;
  role: string;
  /** 1-5. */
  skillLevel: number;
  /** Each 0-100; null if the sim has no needs on file for them yet. */
  needs: Needs | null;
  /** 0-100, from their needs; null with them. */
  mood: number | null;
  /** Up to 5, closest first: affinity, then familiarity. Strangers are left out. */
  relationships: readonly VillagerCardRelationship[];
  /** Their top memories (recency x importance), most important first. */
  memories: readonly { text: string; about: string | null }[];
  /** Open promises, with how many days are left (negative once overdue). */
  promises: readonly { text: string; daysLeft: number }[];
}

const TOP_RELATIONSHIPS = 5;

/** The card for `villagerId`, or null if no such villager lives here. */
export function villagerCard(state: VillageState, villagerId: string): VillagerCardData | null {
  const villager = state.villagers.find((candidate) => candidate.villagerId === villagerId);
  if (!villager) {
    return null;
  }
  const needs = state.villagerNeeds[villagerId] ?? null;
  const nowMinute = state.clock.minute;

  const relationships = state.villagers
    .filter((other) => other.villagerId !== villagerId)
    .map((other) => {
      const relationship = getRelationship(state.relationships, villagerId, other.villagerId);
      return {
        villagerId: other.villagerId,
        label: labelFor(relationship),
        affinity: relationship.affinity,
        familiarity: relationship.familiarity,
      };
    })
    .filter((relationship) => relationship.label !== 'stranger')
    .sort((a, b) => b.affinity - a.affinity || b.familiarity - a.familiarity)
    .slice(0, TOP_RELATIONSHIPS);

  return {
    id: villager.villagerId,
    tradeId: villager.tradeId,
    role: villager.role,
    skillLevel: villager.skillLevel,
    needs,
    mood: needs ? Math.round(moodFromNeeds(needs)) : null,
    relationships,
    memories: topMemoriesFor(state.memory, villagerId, nowMinute).map((memory) => ({
      text: memory.text,
      about: memory.about,
    })),
    promises: state.promises.promises
      .filter((promise) => promise.villagerId === villagerId && promise.status === 'open')
      .map((promise) => ({
        text: promise.text,
        daysLeft: Math.ceil((promise.dueMinute - nowMinute) / MINUTES_PER_DAY),
      })),
  };
}
