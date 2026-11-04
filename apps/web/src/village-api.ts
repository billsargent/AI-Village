import type { DayPhase } from '@ai-village/content';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

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
