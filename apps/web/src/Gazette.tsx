import { buildGazette } from './gazette-edition.js';
import type { VillageFacts } from './village-api.js';

function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** Spec section 15's Morning Gazette: a one-page village newspaper. */
export function Gazette({
  data,
  pendingApprovals,
}: {
  data: VillageFacts;
  pendingApprovals: number;
}) {
  const edition = buildGazette(data, pendingApprovals);
  return (
    <article className="flex w-[40rem] max-w-full flex-col gap-3">
      <header className="border-y-4 border-double border-ink py-1 text-center">
        <p className="text-sm">{edition.dateLine}</p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <section>
          <h3 className="border-b-2 border-ink text-lg">Headlines</h3>
          {edition.headlines.length > 0 ? (
            <ul className="mt-1 flex flex-col gap-1 text-sm">
              {edition.headlines.map((line, index) => (
                <li key={index}>{line}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-ink-soft">A quiet day. Nothing to report.</p>
          )}

          <h3 className="mt-3 border-b-2 border-ink text-lg">Around the green</h3>
          {edition.aroundTheGreen.length > 0 ? (
            <ul className="mt-1 flex flex-col gap-1 text-sm">
              {edition.aroundTheGreen.map((post, index) => (
                <li key={index}>
                  "{post.text}" - {post.author === 'owner' ? 'you' : capitalise(post.author)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-ink-soft">Nothing on the notice board.</p>
          )}

          <h3 className="mt-3 border-b-2 border-ink text-lg">Waiting on you</h3>
          <p className="mt-1 text-sm">{edition.waitingOnYou}</p>
        </section>

        <section>
          <h3 className="border-b-2 border-ink text-lg">Weather and almanac</h3>
          <p className="mt-1 text-sm">{edition.weather} today.</p>
          <ul className="text-sm">
            {edition.almanac.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>

          <h3 className="mt-3 border-b-2 border-ink text-lg">In the stores</h3>
          {edition.stores.length > 0 ? (
            <table className="mt-1 w-full text-sm">
              <tbody>
                {edition.stores.map(({ good, qty, price }) => (
                  <tr key={good}>
                    <td>{capitalise(good)}</td>
                    <td className="text-right">{qty}</td>
                    <td className="text-right text-ink-soft">{price} each</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="mt-1 text-sm text-ink-soft">The stores are empty.</p>
          )}

          <h3 className="mt-3 border-b-2 border-ink text-lg">Puzzle: find the villagers</h3>
          <pre
            aria-label={`Word search hiding: ${edition.puzzle.words.join(', ')}`}
            className="mt-1 font-mono text-sm leading-tight tracking-[0.35em]"
          >
            {edition.puzzle.grid.join('\n')}
          </pre>
          <p className="text-xs text-ink-soft">
            Hidden across and down: {edition.puzzle.words.join(', ')}
          </p>
        </section>
      </div>
    </article>
  );
}
