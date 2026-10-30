import type {
  HappeningCard,
  HappeningCondition,
  SimpleHappeningCondition,
} from '@ai-village/content';
import type { Season } from './calendar.js';
import { seededRandom, weightedPick } from './random.js';
import { anyPairBelowAffinity, anySweetheartFor, type Relationships } from './relationships.js';
import type { WeatherKind } from './weather.js';

/** Gentle excludes damage/illness cards (spec section 5); Eventful fires more often than Lively, the default. */
export const STORYTELLER_STYLES = ['gentle', 'lively', 'eventful'] as const;
export type StorytellerStyle = (typeof STORYTELLER_STYLES)[number];

const BASE_FIRE_CHANCE: Record<StorytellerStyle, number> = {
  gentle: 0.1,
  lively: 0.15,
  eventful: 0.25,
};

/** Each calm day without a happening raises the next day's chance, up to this cap. */
const MAX_TENSION_BONUS = 0.3;
const TENSION_BONUS_PER_CALM_DAY = 0.05;

export interface StorytellerContext {
  villageSeed: number;
  day: number;
  style: StorytellerStyle;
  season: Season;
  weather: WeatherKind;
  isMarketDay: boolean;
  builtBuildingIds: readonly string[];
  /** Village days since a happening last fired. */
  daysSinceLastHappening: number;
  villagerIds: readonly string[];
  relationships: Relationships;
}

function simpleConditionHolds(
  condition: SimpleHappeningCondition,
  context: StorytellerContext,
): boolean {
  switch (condition.kind) {
    case 'always':
      return true;
    case 'notYetModeled':
      return false;
    case 'marketDay':
      return context.isMarketDay;
    case 'season':
      return condition.seasons.includes(context.season);
    case 'weatherIn':
      return condition.weather.includes(context.weather);
    case 'buildingExists':
      return context.builtBuildingIds.includes(condition.building);
    case 'anyPairAffinityBelow':
      return anyPairBelowAffinity(context.relationships, context.villagerIds, condition.threshold);
    case 'anySweetheartForDays':
      return anySweetheartFor(
        context.relationships,
        context.villagerIds,
        context.day,
        condition.days,
      );
  }
}

function conditionHolds(condition: HappeningCondition, context: StorytellerContext): boolean {
  if (condition.kind === 'all') {
    return condition.of.every((sub) => simpleConditionHolds(sub, context));
  }
  return simpleConditionHolds(condition, context);
}

/**
 * Picks at most one happening for the day: eligible cards are those whose
 * condition holds (and, under the Gentle style, that aren't damage/illness);
 * whether one fires at all is a tension-paced roll, and which one fires is
 * weighted among the eligible cards (spec section 5).
 */
export function pickHappening(
  cards: readonly HappeningCard[],
  context: StorytellerContext,
): HappeningCard | null {
  const eligible = cards.filter(
    (card) =>
      conditionHolds(card.condition, context) &&
      !(context.style === 'gentle' && card.isDamageOrIllness),
  );
  if (eligible.length === 0) {
    return null;
  }

  const fireRoll = seededRandom({
    villageSeed: context.villageSeed,
    day: context.day,
    system: 'storyteller',
    entity: 'fire',
  });
  const chance = Math.min(
    1,
    BASE_FIRE_CHANCE[context.style] +
      Math.min(context.daysSinceLastHappening * TENSION_BONUS_PER_CALM_DAY, MAX_TENSION_BONUS),
  );
  if (fireRoll() >= chance) {
    return null;
  }

  const pickRoll = seededRandom({
    villageSeed: context.villageSeed,
    day: context.day,
    system: 'storyteller',
    entity: 'pick',
  });
  return weightedPick(
    eligible,
    eligible.map((card) => card.weight),
    pickRoll,
  );
}
