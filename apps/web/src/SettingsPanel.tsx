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
    </div>
  );
}
