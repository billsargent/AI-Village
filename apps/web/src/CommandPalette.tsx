import { useMemo, useState } from 'react';

export interface PaletteItem {
  id: string;
  /** What it's called: "Ada", "Inbox", "Pause". */
  label: string;
  /** What it does, shown beside the label: "Open their card". */
  hint: string;
  /** Other words it can be found by: a villager's trade, "speed" for the speeds. */
  keywords?: string;
  run: () => void;
}

/**
 * Every typed word must appear somewhere in the label, hint or keywords;
 * matches on the label itself come first.
 */
export function filterPalette(items: readonly PaletteItem[], query: string): PaletteItem[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return [...items];
  }
  const matching = items.filter((item) => {
    const text = `${item.label} ${item.hint} ${item.keywords ?? ''}`.toLowerCase();
    return words.every((word) => text.includes(word));
  });
  const first = words[0] ?? '';
  return [
    ...matching.filter((item) => item.label.toLowerCase().startsWith(first)),
    ...matching.filter((item) => !item.label.toLowerCase().startsWith(first)),
  ];
}

/**
 * Spec section 14's command palette (Ctrl+K): "every place, dialog,
 * villager and action by name". Type to narrow it down, arrows to choose,
 * Enter to go, Escape to close.
 */
export function CommandPalette({
  items,
  onClose,
}: {
  items: readonly PaletteItem[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState(0);
  const shown = useMemo(() => filterPalette(items, query), [items, query]);
  const current = Math.min(chosen, Math.max(0, shown.length - 1));

  const choose = (item: PaletteItem | undefined) => {
    if (!item) {
      return;
    }
    onClose();
    item.run();
  };

  return (
    <div
      className="absolute inset-0 z-30 flex items-start justify-center bg-black/45 p-4 pt-[12vh]"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-label="Command palette"
        className="wood-panel w-[28rem] max-w-full p-1"
      >
        <input
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-activedescendant={shown[current] ? `palette-${shown[current].id}` : undefined}
          aria-label="Search places, villagers and actions"
          placeholder="Go to, meet, open..."
          autoFocus
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setChosen(0);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setChosen(Math.min(current + 1, shown.length - 1));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setChosen(Math.max(current - 1, 0));
            } else if (event.key === 'Enter') {
              event.preventDefault();
              choose(shown[current]);
            } else if (event.key === 'Escape') {
              event.preventDefault();
              onClose();
            }
          }}
          className="w-full border-2 border-parchment-dark bg-parchment px-1 text-lg"
        />
        <ul id="palette-list" role="listbox" className="mt-1 max-h-80 overflow-auto">
          {shown.length === 0 && (
            <li className="p-1 text-sm text-ink-soft">Nothing by that name.</li>
          )}
          {shown.map((item, index) => (
            <li
              key={item.id}
              id={`palette-${item.id}`}
              role="option"
              aria-selected={index === current}
              className={`flex cursor-pointer justify-between gap-3 px-1 ${index === current ? 'bg-parchment-dark' : ''}`}
              onMouseEnter={() => {
                setChosen(index);
              }}
              onClick={() => {
                choose(item);
              }}
            >
              <span>{item.label}</span>
              <span className="text-sm text-ink-soft">{item.hint}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
