import { useQuery } from '@tanstack/react-query';

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

export interface VillageFacts {
  weekday: string;
  season: string;
  seasonDay: number;
  year: number;
  hour: number;
  minuteOfHour: number;
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
