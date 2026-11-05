import { useEffect, useRef, useState } from 'react';
import type { ChronicleEntry } from './village-api.js';

/** Chronicle lines at least this important pop up as they happen. */
export const NOTICE_IMPORTANCE = 3;
const SHOWN_MS = 7000;
const MAX_SHOWN = 3;

interface Notice {
  key: string;
  text: string;
}

function keyOf(entry: ChronicleEntry): string {
  return `${entry.minute}|${entry.text}`;
}

/**
 * Pop-up notices for news as it happens: a building finished, a newcomer,
 * a happening. What was already in the chronicle when the page opened
 * isn't replayed - only what arrives while you're watching.
 */
export function Toasts({ chronicle }: { chronicle: readonly ChronicleEntry[] }) {
  const seen = useRef<Set<string> | null>(null);
  const [notices, setNotices] = useState<readonly Notice[]>([]);

  useEffect(() => {
    if (seen.current === null) {
      seen.current = new Set(chronicle.map(keyOf));
      return;
    }
    const known = seen.current;
    const fresh = chronicle.filter(
      (entry) => !known.has(keyOf(entry)) && entry.importance >= NOTICE_IMPORTANCE,
    );
    for (const entry of chronicle) {
      known.add(keyOf(entry));
    }
    if (fresh.length > 0) {
      setNotices((now) =>
        [...now, ...fresh.map((entry) => ({ key: keyOf(entry), text: entry.text }))].slice(
          -MAX_SHOWN,
        ),
      );
    }
  }, [chronicle]);

  useEffect(() => {
    if (notices.length === 0) {
      return;
    }
    const timer = window.setTimeout(() => {
      setNotices((now) => now.slice(1));
    }, SHOWN_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [notices]);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none absolute bottom-12 left-3 z-20 flex flex-col gap-1"
    >
      {notices.map((notice) => (
        <div key={notice.key} role="status" className="wood-panel max-w-sm px-1 text-sm">
          {notice.text}
        </div>
      ))}
    </div>
  );
}
