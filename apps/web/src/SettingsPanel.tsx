import { useState } from 'react';
import { useClearDeepseekApiKey, useSaveDeepseekApiKey, useSettingsStatus } from './village-api.js';

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
    <div className="mt-2 max-w-md rounded border border-slate-300 bg-white p-3">
      <h2 className="font-semibold">Settings</h2>
      {isPending ? (
        <p className="mt-2 text-slate-600">Loading...</p>
      ) : (
        <p className="mt-2 text-sm text-slate-600">
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
          className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1"
        />
        <button
          type="submit"
          disabled={saveKey.isPending || input.trim().length === 0}
          className="rounded bg-slate-700 px-3 py-1 text-white disabled:opacity-50"
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
            className="rounded bg-slate-200 px-3 py-1 text-slate-900 disabled:opacity-50"
          >
            Clear
          </button>
        )}
      </form>
      {saveKey.isError && <p className="mt-2 text-sm text-red-700">Couldn't save the key.</p>}
      {clearKey.isError && <p className="mt-2 text-sm text-red-700">Couldn't clear the key.</p>}
    </div>
  );
}
