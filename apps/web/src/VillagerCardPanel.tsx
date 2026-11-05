import { spriteForVillager } from '@ai-village/content';
import { useEffect, useRef } from 'react';
import {
  useDecidePromise,
  useThankVillager,
  useVillagerCard,
  type VillagerCard,
} from './village-api.js';

function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

const PORTRAIT_SCALE = 4;

/** The villager's own map sprite, drawn big - the art set has no separate portraits yet. */
function Portrait({ villagerId }: { villagerId: string }) {
  const frame = spriteForVillager(villagerId);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const context = canvasRef.current?.getContext('2d');
    if (!context) {
      // No 2D canvas here (a test environment) - the frame stays empty.
      return;
    }
    const image = new Image();
    image.onload = () => {
      context.imageSmoothingEnabled = false;
      context.clearRect(0, 0, frame.width, frame.height);
      context.drawImage(
        image,
        frame.x,
        frame.y,
        frame.width,
        frame.height,
        0,
        0,
        frame.width,
        frame.height,
      );
    };
    image.src = `/${frame.file}`;
  }, [frame.file, frame.x, frame.y, frame.width, frame.height]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      width={frame.width}
      height={frame.height}
      className="shrink-0 border-4 border-parchment-dark bg-[#9fd27a] [image-rendering:pixelated]"
      style={{ width: frame.width * PORTRAIT_SCALE, height: frame.height * PORTRAIT_SCALE }}
    />
  );
}

/** A word to go with the mood bar (spec section 14: colours always come with a word). */
export function moodWord(mood: number): string {
  if (mood >= 80) return 'Happy';
  if (mood >= 60) return 'Content';
  if (mood >= 40) return 'So-so';
  if (mood >= 20) return 'Low';
  return 'Miserable';
}

const NEED_LABELS: readonly [keyof NonNullable<VillagerCard['needs']>, string][] = [
  ['hunger', 'Fed'],
  ['energy', 'Energy'],
  ['social', 'Company'],
  ['fun', 'Fun'],
  ['comfort', 'Comfort'],
  ['purpose', 'Purpose'],
];

function Bar({ label, value }: { label: string; value: number }) {
  const rounded = Math.round(value);
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-20 shrink-0">{label}</span>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={rounded}
        className="h-3 flex-1 border-2 border-ink/50 bg-parchment-dark/40"
      >
        <div
          className={rounded < 30 ? 'h-full bg-[#c0533a]' : 'h-full bg-[#5f9e3f]'}
          style={{ width: `${rounded}%` }}
        />
      </div>
      <span className="w-8 text-right tabular-nums">{rounded}</span>
    </div>
  );
}

const LABEL_WORDS: Record<string, string> = {
  'close-friend': 'close friend',
  acquaintance: 'knows them a little',
};

/**
 * Spec section 14's villager card: who they are, where they are, their
 * needs and mood, who they know, what they remember and what they've
 * promised. Likes and the diary aren't shown - the village doesn't have
 * them yet.
 */
export function VillagerCardPanel({
  villagerId,
  where,
  onChat,
  onFollow,
}: {
  villagerId: string;
  where: string | null;
  onChat: () => void;
  /** Spec section 14's Follow button: the camera follows them about. */
  onFollow?: (() => void) | undefined;
}) {
  const { data: card, isPending, isError } = useVillagerCard(villagerId);
  const thank = useThankVillager();
  const decidePromise = useDecidePromise();
  const name = capitalise(villagerId);

  if (isPending) {
    return <p className="text-ink-soft">Loading...</p>;
  }
  if (isError) {
    return <p>Couldn't find {name}.</p>;
  }

  const trade = card.role === 'mayor' ? `the mayor` : `the ${card.tradeId}`;
  return (
    <div className="flex w-[30rem] max-w-full flex-col gap-3">
      <div className="flex items-start gap-3">
        <Portrait villagerId={villagerId} />
        <div className="flex flex-1 flex-col gap-1">
          <p className="text-lg">
            {name}, {trade}
          </p>
          <p className="text-sm text-ink-soft">
            Skill {card.skillLevel} of 5{where ? ` - ${where} right now` : ''}
          </p>
          {card.traits.length > 0 && (
            <p className="text-sm" aria-label="Traits">
              {card.traits
                .map(
                  (trait) =>
                    `${capitalise(trait.id.replace(/-/g, ' '))}${trait.isFlaw ? ' (a flaw)' : ''}`,
                )
                .join(', ')}
            </p>
          )}
          {card.mood !== null && (
            <p className="text-sm">
              Mood: {moodWord(card.mood)} ({card.mood})
            </p>
          )}
          <div className="mt-1 flex gap-1">
            <button type="button" className="wood-button" onClick={onChat}>
              Chat with {name}
            </button>
            {onFollow && (
              <button type="button" className="wood-button" onClick={onFollow}>
                Follow {name}
              </button>
            )}
            <button
              type="button"
              className="wood-button"
              disabled={thank.isPending}
              onClick={() => {
                thank.mutate(villagerId);
              }}
            >
              Thank {name}
            </button>
          </div>
          {thank.isSuccess && <p className="text-sm">{name} looks pleased.</p>}
          {thank.isError && (
            <p className="text-sm">
              {thank.error.message.includes('already')
                ? `You've already thanked ${name} today.`
                : `Couldn't thank ${name}: ${thank.error.message}`}
            </p>
          )}
        </div>
      </div>

      {card.needs && (
        <section aria-label="Needs" className="flex flex-col gap-1">
          <h3 className="text-lg">Needs</h3>
          {NEED_LABELS.map(([key, label]) => (
            <Bar key={key} label={label} value={card.needs?.[key] ?? 0} />
          ))}
        </section>
      )}

      <section>
        <h3 className="text-lg">People they know</h3>
        {card.relationships.length > 0 ? (
          <ul className="list-disc pl-5 text-sm">
            {card.relationships.map((relationship) => (
              <li key={relationship.villagerId}>
                {capitalise(relationship.villagerId)} -{' '}
                {LABEL_WORDS[relationship.label] ?? relationship.label}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-soft">Nobody yet.</p>
        )}
      </section>

      <section>
        <h3 className="text-lg">Remembers</h3>
        {card.memories.length > 0 ? (
          <ul className="list-disc pl-5 text-sm">
            {card.memories.map((memory, index) => (
              <li key={index}>{memory.text}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-soft">Nothing worth remembering yet.</p>
        )}
      </section>

      <section>
        <h3 className="text-lg">Promises to you</h3>
        {card.promises.length > 0 ? (
          <ul className="list-disc pl-5 text-sm">
            {card.promises.map((promise) => (
              <li key={promise.id} className="flex flex-wrap items-center gap-1">
                {promise.text} -{' '}
                {promise.daysLeft < 0
                  ? 'overdue'
                  : promise.daysLeft === 0
                    ? 'due today'
                    : `due in ${promise.daysLeft} day${promise.daysLeft === 1 ? '' : 's'}`}
                <button
                  type="button"
                  className="wood-button text-xs"
                  disabled={decidePromise.isPending}
                  aria-label={`Kept: ${promise.text}`}
                  onClick={() => {
                    decidePromise.mutate({ promiseId: promise.id, decision: 'kept' });
                  }}
                >
                  Kept
                </button>
                <button
                  type="button"
                  className="wood-button text-xs"
                  disabled={decidePromise.isPending}
                  aria-label={`Let them off: ${promise.text}`}
                  onClick={() => {
                    decidePromise.mutate({ promiseId: promise.id, decision: 'released' });
                  }}
                >
                  Let them off
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-soft">None open.</p>
        )}
      </section>
    </div>
  );
}
