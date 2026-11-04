import { useEffect, useRef, useState } from 'react';
import { useChat, useSendChat, useSettingsStatus } from './village-api.js';

function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * Spec section 14's chat dock: talk with one villager. Their replies come
 * from the talk model on the owner's key, so with no key saved this says
 * where to add one instead of offering a box that can't work.
 */
export function ChatPanel({ villagerId, tradeId }: { villagerId: string; tradeId: string }) {
  const { data: lines = [], isPending } = useChat(villagerId);
  const { data: settings } = useSettingsStatus();
  const send = useSendChat();
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLLIElement>(null);
  const name = capitalise(villagerId);

  useEffect(() => {
    // Not every environment has scrollIntoView (jsdom, in tests, doesn't).
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [lines.length, send.isPending]);

  const submit = () => {
    const message = draft.trim();
    if (message.length === 0 || send.isPending) {
      return;
    }
    send.mutate(
      { villagerId, message },
      {
        onSuccess: () => {
          setDraft('');
        },
      },
    );
  };

  return (
    <div className="flex w-[28rem] max-w-full flex-col gap-2">
      <p className="text-sm text-ink-soft">
        {name}, the {tradeId}
      </p>
      <ul
        className="flex h-72 flex-col gap-2 overflow-auto border-4 border-parchment-dark bg-parchment-dark/30 p-2"
        aria-label={`Conversation with ${name}`}
        aria-live="polite"
      >
        {isPending ? (
          <li className="text-ink-soft">Loading...</li>
        ) : lines.length === 0 ? (
          <li className="text-ink-soft">Say hello to {name}.</li>
        ) : (
          lines.map((line, index) => (
            <li
              key={`${line.at}-${index}`}
              className={line.from === 'owner' ? 'self-end text-right' : 'self-start'}
            >
              <div className="text-xs text-ink-soft">{line.from === 'owner' ? 'You' : name}</div>
              <div
                className={
                  line.from === 'owner'
                    ? 'border-2 border-ink/40 bg-[#fff6dc] px-2 py-1'
                    : 'border-2 border-ink/40 bg-[#e8d3a3] px-2 py-1'
                }
              >
                {line.text}
              </div>
            </li>
          ))
        )}
        {send.isPending && (
          <li className="self-start text-ink-soft" aria-label={`${name} is answering`}>
            {name} is thinking...
          </li>
        )}
        <li ref={endRef} aria-hidden="true" />
      </ul>
      {settings && !settings.hasDeepseekApiKey ? (
        <p className="text-sm">Save a DeepSeek API key in Settings to chat with {name}.</p>
      ) : (
        <form
          className="flex gap-1"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <input
            className="min-w-0 flex-1 border-2 border-ink/60 bg-[#fff6dc] px-2 py-1"
            aria-label={`Message to ${name}`}
            placeholder={`Say something to ${name}`}
            maxLength={1000}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
            }}
          />
          <button
            type="submit"
            className="wood-button"
            disabled={send.isPending || draft.trim().length === 0}
          >
            Send
          </button>
        </form>
      )}
      {send.isError && (
        <p role="alert" className="text-sm text-[#b3261e]">
          {send.error.message}
        </p>
      )}
    </div>
  );
}
