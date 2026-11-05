/**
 * Small talk by rules: what villagers say as they pass each other, and
 * what they dream at night (spec section 15's small touches). The spec's
 * own source for these is a nightly batch of model-written lines; until
 * that exists, these stand in, picked from the hour, the weather, the
 * season and each villager's trade.
 */

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

function pick<T>(options: readonly T[], seed: string): T | undefined {
  return options[hash(seed) % options.length];
}

function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export interface GreetingContext {
  /** Who's being greeted. */
  to: string;
  hour: number;
  weather: string;
  festival: string | null;
  /** Anything that changes between meetings, so the same pair doesn't always say the same. */
  seed: string;
}

/** One line from one villager to another as they pass: "Morning, Ada!" */
export function greeting({ to, hour, weather, festival, seed }: GreetingContext): string {
  const name = capitalise(to);
  if (festival) {
    return pick([`Happy ${festival}, ${name}!`, `See you at the ${festival}?`], seed) ?? 'Hello!';
  }
  const byWeather: Record<string, readonly string[]> = {
    rain: [`Wet one, ${name}!`, 'Mind the puddles!'],
    storm: ['Get indoors, quick!', `Hold on to your hat, ${name}!`],
    snow: [`Mind the ice, ${name}!`, 'Snow again!'],
    fog: [`Is that you, ${name}?`, "Can't see a thing!"],
    heat: ['Hot enough for you?', `Keep cool, ${name}.`],
    wind: ['Blowing a gale!', `Windy one, ${name}.`],
  };
  const timeOfDay =
    hour < 12
      ? [`Morning, ${name}!`, 'Good morning!', `Up early, ${name}?`]
      : hour < 17
        ? [`Afternoon, ${name}.`, `Busy day, ${name}?`, 'Lovely day.']
        : [`Evening, ${name}.`, 'Off home?', `Night's drawing in, ${name}.`];
  return pick([...timeOfDay, ...(byWeather[weather] ?? [])], seed) ?? `Hello, ${name}!`;
}

const TRADE_DREAMS: Record<string, readonly string[]> = {
  farmer: ['golden wheat as far as the eye can see', 'a turnip the size of a cart'],
  miller: ['the mill sails turning by themselves', 'flour as fine as snow'],
  baker: ['a loaf that never goes stale', 'the perfect crust'],
  fisher: ['a golden carp that talks', 'the one that got away'],
  innkeeper: ['a full house and a quiet night', 'a song everyone knows the words to'],
  woodcutter: ['a forest of easy-splitting oak', 'a tree that sings when it falls'],
  carpenter: ['a chair that fits everyone', 'a bridge across the whole river'],
  smith: ['a horseshoe that brings real luck', 'the anvil ringing like a bell'],
  gardener: ['roses in every colour at once', 'a garden that waters itself'],
  herbalist: ['a cure for every cough', 'a meadow of rare herbs'],
  teacher: ['a class that asks good questions', 'a book with every answer'],
  postmaster: ['a letter that delivers itself', 'every parcel on time'],
  mayor: ['a treasury overflowing with coins', 'a statue on the green'],
};

const SEASON_DREAMS: Record<string, readonly string[]> = {
  spring: ['blossom falling like snow'],
  summer: ['swimming in the river'],
  autumn: ['a mountain of crunchy leaves'],
  winter: ['the first snow of the year'],
};

const ANY_DREAMS = ['flying over the village', 'a feast on the green', 'a talking cat'];

/** A one-line dream: "dreams of golden wheat as far as the eye can see". */
export function dreamFor(villagerId: string, tradeId: string, season: string, day: string): string {
  const options = [
    ...(TRADE_DREAMS[tradeId] ?? []),
    ...(SEASON_DREAMS[season] ?? []),
    ...ANY_DREAMS,
  ];
  return `dreams of ${pick(options, `${villagerId}:${day}`) ?? 'nothing at all'}`;
}
