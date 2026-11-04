import type { DayPhase } from '@ai-village/content';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

/**
 * Mirrors `@ai-village/agent`'s `FactsSnapshot` - this package can't
 * import `agent` (spec section 3's `web-stays-client-side` dependency
 * boundary), so the shape of the server's JSON response is restated here
 * rather than shared.
 */
export interface ChronicleEntry {
  minute: number;
  kind: string;
  text: string;
  actors: readonly string[];
  importance: number;
  public: boolean;
}

export interface VillagerFact {
  id: string;
  tradeId: string;
  role: string;
}

export interface Festival {
  name: string;
  season: string;
  /** 1-indexed day within the season. */
  seasonDay: number;
}

export interface VillageFacts {
  weekday: string;
  season: string;
  seasonDay: number;
  year: number;
  hour: number;
  minuteOfHour: number;
  phase: DayPhase;
  weather: string;
  isMarketDay: boolean;
  festival: string | null;
  population: number;
  villagers: readonly VillagerFact[];
  builtBuildingIds: readonly string[];
  stores: Readonly<Record<string, number>>;
  treasuryCoins: number;
  treasuryDeltaYesterday: number;
  recentChronicle: readonly ChronicleEntry[];
  festivals: readonly Festival[];
}

async function fetchVillageFacts(): Promise<VillageFacts> {
  const response = await fetch('/api/village');
  if (!response.ok) {
    throw new Error(`GET /api/village failed: ${response.status}`);
  }
  return (await response.json()) as VillageFacts;
}

export function useVillageFacts() {
  return useQuery({ queryKey: ['village'], queryFn: fetchVillageFacts });
}

/** The village clock's speed - spec section 14's pause, 1x, 2x and 4x. */
export type ClockSpeed = 0 | 1 | 2 | 4;

export interface ClockStatus {
  speed: ClockSpeed;
  paused: boolean;
}

async function fetchClockStatus(): Promise<ClockStatus> {
  const response = await fetch('/api/clock');
  if (!response.ok) {
    throw new Error(`GET /api/clock failed: ${response.status}`);
  }
  return (await response.json()) as ClockStatus;
}

export function useClockStatus() {
  return useQuery({ queryKey: ['clock'], queryFn: fetchClockStatus });
}

async function setClockSpeed(speed: ClockSpeed): Promise<ClockStatus> {
  const response = await fetch('/api/clock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ speed }),
  });
  if (!response.ok) {
    throw new Error(`POST /api/clock failed: ${response.status}`);
  }
  return (await response.json()) as ClockStatus;
}

export function useSetClockSpeed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: setClockSpeed,
    onSuccess: (status) => {
      queryClient.setQueryData(['clock'], status);
    },
  });
}

/**
 * Keeps the village and clock queries current from the server's live
 * updates (spec section 2's server-sent events) - a fresh copy every
 * village minute, settled day or speed change, instead of polling. The
 * browser reconnects on its own if the server restarts. Does nothing
 * where `EventSource` doesn't exist (a test environment).
 */
export function useLiveUpdates() {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (typeof EventSource === 'undefined') {
      return;
    }
    const source = new EventSource('/api/events');
    source.addEventListener('village', (event) => {
      const payload = JSON.parse((event as MessageEvent<string>).data) as {
        facts: VillageFacts;
        clock: ClockStatus;
      };
      queryClient.setQueryData(['village'], payload.facts);
      queryClient.setQueryData(['clock'], payload.clock);
    });
    return () => {
      source.close();
    };
  }, [queryClient]);
}

/**
 * Whether the owner's DeepSeek API key is set - never the key value
 * itself, which the server never sends to the browser (see
 * `apps/server/src/app.ts`'s `/api/settings` routes).
 */
export interface SettingsStatus {
  hasDeepseekApiKey: boolean;
}

async function fetchSettingsStatus(): Promise<SettingsStatus> {
  const response = await fetch('/api/settings');
  if (!response.ok) {
    throw new Error(`GET /api/settings failed: ${response.status}`);
  }
  return (await response.json()) as SettingsStatus;
}

export function useSettingsStatus() {
  return useQuery({ queryKey: ['settings'], queryFn: fetchSettingsStatus });
}

async function saveDeepseekApiKey(deepseekApiKey: string): Promise<SettingsStatus> {
  const response = await fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deepseekApiKey }),
  });
  if (!response.ok) {
    throw new Error(`POST /api/settings failed: ${response.status}`);
  }
  return (await response.json()) as SettingsStatus;
}

export function useSaveDeepseekApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: saveDeepseekApiKey,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });
}

async function clearDeepseekApiKey(): Promise<SettingsStatus> {
  const response = await fetch('/api/settings', { method: 'DELETE' });
  if (!response.ok) {
    throw new Error(`DELETE /api/settings failed: ${response.status}`);
  }
  return (await response.json()) as SettingsStatus;
}

export function useClearDeepseekApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: clearDeepseekApiKey,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });
}
