import { moodWord, Portrait } from './VillagerCardPanel.js';
import { useVillagerCards } from './village-api.js';

function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * Spec section 14's Villagers page: everyone at a glance - trade, where
 * they are, mood and traits. A name opens their full card.
 */
export function VillagersPage({
  whereabouts,
  onOpen,
}: {
  whereabouts: ReadonlyMap<string, string>;
  onOpen: (villagerId: string) => void;
}) {
  const { data: cards, isPending, isError } = useVillagerCards();
  if (isPending) {
    return <p className="text-ink-soft">Loading the villagers...</p>;
  }
  if (isError) {
    return <p>Couldn't load the villagers.</p>;
  }
  return (
    <ul className="grid max-h-[70vh] w-[44rem] max-w-full grid-cols-1 gap-2 overflow-auto sm:grid-cols-2">
      {cards.map((card) => (
        <li key={card.id} className="flex gap-2 border-2 border-parchment-dark p-1">
          <Portrait villagerId={card.id} />
          <div className="flex min-w-0 flex-col text-sm">
            <button
              type="button"
              className="text-left text-lg underline decoration-dotted underline-offset-2"
              onClick={() => {
                onOpen(card.id);
              }}
            >
              {capitalise(card.id)}
            </button>
            <span>{card.role === 'mayor' ? 'The mayor' : capitalise(card.tradeId)}</span>
            <span className="text-ink-soft">{whereabouts.get(card.id) ?? 'about the village'}</span>
            {card.mood !== null && (
              <span>
                Mood: {moodWord(card.mood)} ({card.mood})
              </span>
            )}
            <span className="text-ink-soft">
              {card.traits.map((trait) => trait.id.replace(/-/g, ' ')).join(', ')}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
