import { useEffect, useRef, useState } from 'react';
import { useFinishFocusSession } from './village-api.js';

/** Spec section 15's work-along lengths, in minutes. */
export const FOCUS_LENGTHS = [25, 50, 90] as const;
const STORAGE_KEY = 'ai-village.focus';

interface Session {
  minutes: number;
  /** When it ends, in real time (ms since epoch). */
  endsAt: number;
}

function loadSession(): Session | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<Session>) : null;
    return parsed && typeof parsed.minutes === 'number' && typeof parsed.endsAt === 'number'
      ? { minutes: parsed.minutes, endsAt: parsed.endsAt }
      : null;
  } catch {
    return null;
  }
}

function saveSession(session: Session | null): void {
  try {
    if (session) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Storage off: the session still runs until the page reloads.
  }
}

/** "24:59" */
export function countdown(msLeft: number): string {
  const seconds = Math.max(0, Math.ceil(msLeft / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * Spec section 15's work-along: a focus session of 25, 50 or 90 minutes,
 * started from the top bar, with the village working beside you. When it
 * ends the village cheers and the chronicle notes it; stopping early
 * records nothing. The session survives a reload.
 */
export function WorkAlong({ now = () => Date.now() }: { now?: () => number }) {
  const [session, setSession] = useState<Session | null>(loadSession);
  const [choosing, setChoosing] = useState(false);
  const [cheer, setCheer] = useState<number | null>(null);
  const [, tick] = useState(0);
  const finish = useFinishFocusSession();
  // A ref, so a new mutation object each render doesn't restart the countdown.
  const finishRef = useRef(finish);
  finishRef.current = finish;

  useEffect(() => {
    if (!session) {
      return;
    }
    const timer = window.setInterval(() => {
      if (now() >= session.endsAt) {
        finishRef.current.mutate(session.minutes);
        setCheer(session.minutes);
        setSession(null);
        saveSession(null);
      } else {
        tick((n) => n + 1);
      }
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, [session, now]);

  useEffect(() => {
    if (cheer === null) {
      return;
    }
    const timer = window.setTimeout(() => {
      setCheer(null);
    }, 6000);
    return () => {
      window.clearTimeout(timer);
    };
  }, [cheer]);

  return (
    <div className="mt-1 flex flex-col items-center gap-1 border-t-2 border-parchment-dark pt-1">
      {session ? (
        <div className="flex items-center gap-2" role="timer" aria-label="Focus session">
          <span className="text-lg">Focus {countdown(session.endsAt - now())}</span>
          <button
            type="button"
            className="wood-button text-sm"
            onClick={() => {
              setSession(null);
              saveSession(null);
            }}
          >
            Stop
          </button>
        </div>
      ) : choosing ? (
        <div className="flex gap-1" role="group" aria-label="Focus for">
          {FOCUS_LENGTHS.map((minutes) => (
            <button
              key={minutes}
              type="button"
              className="wood-button text-sm"
              onClick={() => {
                const next = { minutes, endsAt: now() + minutes * 60_000 };
                setSession(next);
                saveSession(next);
                setChoosing(false);
              }}
            >
              {minutes}m
            </button>
          ))}
        </div>
      ) : (
        <button
          type="button"
          className="wood-button text-sm"
          onClick={() => {
            setChoosing(true);
          }}
        >
          Work along
        </button>
      )}
      {cheer !== null && (
        <>
          <p role="status" className="text-sm">
            The village cheers! {cheer} minutes of good work.
          </p>
          <Confetti />
        </>
      )}
    </div>
  );
}

const CONFETTI_COLOURS = ['#e04a3a', '#f2c14e', '#4a90d9', '#6cc070', '#f28fb5'];

/** A shower of paper over the whole screen; nothing under reduced motion. */
function Confetti() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-40 overflow-hidden motion-reduce:hidden"
    >
      {Array.from({ length: 40 }, (_, i) => (
        <span
          key={i}
          className="confetti absolute top-[-12px] block h-3 w-2"
          style={{
            left: `${(i * 37) % 100}%`,
            backgroundColor: CONFETTI_COLOURS[i % CONFETTI_COLOURS.length],
            animationDelay: `${(i % 10) * 0.15}s`,
            animationDuration: `${2.5 + (i % 5) * 0.4}s`,
          }}
        />
      ))}
    </div>
  );
}
