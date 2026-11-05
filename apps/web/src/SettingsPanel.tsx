import { useState } from 'react';
import {
  useClearDeepseekApiKey,
  useSaveDeepseekApiKey,
  useSaveSettings,
  useSettingsStatus,
  type SettingsStatus,
} from './village-api.js';

/**
 * The owner's DeepSeek API key, pasted here and saved to the database
 * (a deliberate session decision, not the spec's own OS-keychain design
 * - see `packages/db/src/schema.ts`'s comment on the `settings` table).
 * The server never sends the key's value back to the browser, only
 * whether one is set, so this component never has it to display either.
 */
export function SettingsPanel() {
  const { data, isPending } = useSettingsStatus();
  const saveKey = useSaveDeepseekApiKey();
  const clearKey = useClearDeepseekApiKey();
  const [input, setInput] = useState('');

  return (
    <div className="w-96 max-w-full">
      {isPending ? (
        <p className="text-ink-soft">Loading...</p>
      ) : (
        <p className="text-ink-soft">
          DeepSeek API key: {data?.hasDeepseekApiKey ? 'set' : 'not set'}
        </p>
      )}
      <form
        className="mt-2 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (input.trim().length === 0) {
            return;
          }
          saveKey.mutate(input, {
            onSuccess: () => {
              setInput('');
            },
          });
        }}
      >
        <input
          type="password"
          value={input}
          onChange={(event) => {
            setInput(event.target.value);
          }}
          placeholder="sk-..."
          aria-label="DeepSeek API key"
          className="min-w-0 flex-1 border-2 border-ink-soft bg-[#fffaf0] px-2 py-1 font-sans"
        />
        <button
          type="submit"
          disabled={saveKey.isPending || input.trim().length === 0}
          className="wood-button"
        >
          Save
        </button>
        {data?.hasDeepseekApiKey && (
          <button
            type="button"
            disabled={clearKey.isPending}
            onClick={() => {
              clearKey.mutate();
            }}
            className="wood-button"
          >
            Clear
          </button>
        )}
      </form>
      {saveKey.isError && <p className="mt-2 text-sm text-red-800">Couldn't save the key.</p>}
      {clearKey.isError && <p className="mt-2 text-sm text-red-800">Couldn't clear the key.</p>}
      {data && <MayorSettings status={data} />}
    </div>
  );
}

const OUTCOMES: Record<string, string> = {
  ran: 'attended to their duties',
  off: 'was switched off',
  'no-key': 'had no key to use',
  'no-ceiling': 'had no monthly ceiling set',
  'over-budget': 'stopped: the monthly ceiling is reached',
  busy: 'was already busy',
  failed: "couldn't reach the model",
};

function dollars(amount: number): string {
  return `$${amount < 0.01 && amount > 0 ? amount.toFixed(4) : amount.toFixed(2)}`;
}

/**
 * The Mayor's mornings (spec section 11's "The Mayor's day") and spec
 * section 16's monthly ceiling. Off until the owner turns it on, which
 * needs a key and a ceiling first - every morning's turn spends money.
 */
function MayorSettings({ status }: { status: SettingsStatus }) {
  const save = useSaveSettings();
  const [ceiling, setCeiling] = useState(
    status.monthlyCeilingUsd === null ? '' : String(status.monthlyCeilingUsd),
  );
  const parsedCeiling = Number(ceiling);
  const ceilingValid = ceiling.trim() !== '' && parsedCeiling > 0 && parsedCeiling <= 1000;
  const canTurnOn = status.hasDeepseekApiKey && status.monthlyCeilingUsd !== null;

  return (
    <section className="mt-4 border-t-2 border-parchment-dark pt-3">
      <h3 className="text-xl">The Mayor</h3>
      <p className="text-sm text-ink-soft">
        Each village morning the Mayor can read the village and act: accept orders, propose
        buildings, call votes - and ask you before hiring anyone. Each morning is a model call on
        your key.
      </p>

      <form
        className="mt-2 flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (ceilingValid) {
            save.mutate({ monthlyCeilingUsd: parsedCeiling });
          }
        }}
      >
        <label htmlFor="monthly-ceiling">Monthly ceiling $</label>
        <input
          id="monthly-ceiling"
          type="number"
          min="0.01"
          max="1000"
          step="0.01"
          value={ceiling}
          onChange={(event) => {
            setCeiling(event.target.value);
          }}
          className="w-24 border-2 border-ink-soft bg-[#fffaf0] px-2 py-1 font-sans"
        />
        <button type="submit" className="wood-button" disabled={!ceilingValid || save.isPending}>
          Set ceiling
        </button>
      </form>

      <p className="mt-1 text-sm text-ink-soft">
        Spent in the last 30 days: {dollars(status.spentThisMonthUsd)}
        {status.monthlyCeilingUsd !== null ? ` of ${dollars(status.monthlyCeilingUsd)}` : ''}
      </p>

      <label className="mt-2 flex items-center gap-2">
        <input
          type="checkbox"
          checked={status.mayorAutonomy}
          disabled={(!canTurnOn && !status.mayorAutonomy) || save.isPending}
          onChange={(event) => {
            save.mutate({ mayorAutonomy: event.target.checked });
          }}
          className="h-5 w-5"
        />
        Let the Mayor act each morning
      </label>
      {!canTurnOn && (
        <p className="text-sm text-ink-soft">Save a key and set a ceiling to turn this on.</p>
      )}
      {status.mayorLastTurn && (
        <p className="text-sm text-ink-soft">
          Last morning, the Mayor{' '}
          {OUTCOMES[status.mayorLastTurn.outcome] ?? status.mayorLastTurn.outcome}.
          {status.mayorLastTurn.reply && (
            <span className="mt-1 block text-ink">"{status.mayorLastTurn.reply}"</span>
          )}
        </p>
      )}
      {save.isError && (
        <p className="mt-1 text-sm text-red-800" role="alert">
          {save.error.message}
        </p>
      )}
    </section>
  );
}
