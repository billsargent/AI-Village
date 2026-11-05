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
  /** The newest notes on the notice board, newest first. */
  boardPosts: readonly { author: string; text: string; postedDay: number }[];
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

/** One tool call waiting on the owner, or decided by them (spec section 12). */
export interface ApprovalRequest {
  id: number;
  toolId: string;
  args: unknown;
  risk: string;
  preview: string | null;
  requestedBy: string;
  status: 'pending' | 'approved' | 'declined';
  createdAt: number;
}

export interface ApprovalsList {
  pending: readonly ApprovalRequest[];
  decided: readonly ApprovalRequest[];
}

async function fetchApprovals(): Promise<ApprovalsList> {
  const response = await fetch('/api/approvals');
  if (!response.ok) {
    throw new Error(`GET /api/approvals failed: ${response.status}`);
  }
  return (await response.json()) as ApprovalsList;
}

export function useApprovals() {
  return useQuery({ queryKey: ['approvals'], queryFn: fetchApprovals });
}

/** How many approvals are waiting, for the bell - kept current by the live updates. */
export function usePendingApprovalCount(): number {
  const { data } = useApprovals();
  return data?.pending.length ?? 0;
}

async function decideApproval(input: {
  id: number;
  decision: 'approved' | 'declined';
}): Promise<ApprovalRequest> {
  const response = await fetch(`/api/approvals/${input.id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision: input.decision }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `POST /api/approvals failed: ${response.status}`);
  }
  return (await response.json()) as ApprovalRequest;
}

export function useDecideApproval() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: decideApproval,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['approvals'] });
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
        approvals: { pending: number };
      };
      queryClient.setQueryData(['village'], payload.facts);
      queryClient.setQueryData(['clock'], payload.clock);
      // An open villager card follows their needs and memories as they change.
      void queryClient.invalidateQueries({ queryKey: ['villager'] });
      // The stream only carries the count; refetch the list when it changes.
      const known = queryClient.getQueryData<ApprovalsList>(['approvals']);
      if (known?.pending.length !== payload.approvals.pending) {
        void queryClient.invalidateQueries({ queryKey: ['approvals'] });
      }
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
  /** Whether the Mayor takes a model turn each village morning, spending on the key. */
  mayorAutonomy: boolean;
  /** Spec section 16's monthly ceiling, or null until the owner sets one. */
  monthlyCeilingUsd: number | null;
  /** What model calls have cost over the last 30 days. */
  spentThisMonthUsd: number;
  /** The Mayor's most recent attempt, if any since the server started. */
  mayorLastTurn: { at: number; outcome: string; reply?: string } | null;
}

export interface SettingsChanges {
  mayorAutonomy?: boolean;
  monthlyCeilingUsd?: number;
}

async function saveSettings(changes: SettingsChanges): Promise<SettingsStatus> {
  const response = await fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(changes),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `POST /api/settings failed: ${response.status}`);
  }
  return (await response.json()) as SettingsStatus;
}

export function useSaveSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: saveSettings,
    onSuccess: (status) => {
      queryClient.setQueryData(['settings'], status);
    },
  });
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

/** One line of a chat with a villager (spec section 11's "Chat with the owner"). */
export interface ChatLine {
  from: 'owner' | 'villager';
  text: string;
  at: number;
}

async function fetchChat(villagerId: string): Promise<readonly ChatLine[]> {
  const response = await fetch(`/api/villagers/${encodeURIComponent(villagerId)}/chat`);
  if (!response.ok) {
    throw new Error(`GET chat failed: ${response.status}`);
  }
  return ((await response.json()) as { lines: readonly ChatLine[] }).lines;
}

export function useChat(villagerId: string) {
  return useQuery({ queryKey: ['chat', villagerId], queryFn: () => fetchChat(villagerId) });
}

async function sendChat(input: {
  villagerId: string;
  message: string;
}): Promise<{ lines: readonly ChatLine[]; approvalRequested: boolean }> {
  const response = await fetch(`/api/villagers/${encodeURIComponent(input.villagerId)}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: input.message }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `POST chat failed: ${response.status}`);
  }
  return (await response.json()) as { lines: readonly ChatLine[]; approvalRequested: boolean };
}

export function useSendChat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: sendChat,
    onSuccess: (result, input) => {
      queryClient.setQueryData(['chat', input.villagerId], result.lines);
      // A chat costs money and may have asked for an approval.
      void queryClient.invalidateQueries({ queryKey: ['settings'] });
      if (result.approvalRequested) {
        void queryClient.invalidateQueries({ queryKey: ['approvals'] });
      }
    },
  });
}

/** Spec section 14's villager card - mirrors `@ai-village/agent`'s `VillagerCardData`. */
export interface VillagerCard {
  id: string;
  tradeId: string;
  role: string;
  skillLevel: number;
  traits: readonly { id: string; howTheyTalk: string; isFlaw: boolean }[];
  needs: {
    hunger: number;
    energy: number;
    social: number;
    fun: number;
    comfort: number;
    purpose: number;
  } | null;
  mood: number | null;
  relationships: readonly {
    villagerId: string;
    label: string;
    affinity: number;
    familiarity: number;
  }[];
  memories: readonly { text: string; about: string | null }[];
  promises: readonly { id: number; text: string; daysLeft: number }[];
}

async function fetchVillagerCard(villagerId: string): Promise<VillagerCard> {
  const response = await fetch(`/api/villagers/${encodeURIComponent(villagerId)}`);
  if (!response.ok) {
    throw new Error(`GET villager failed: ${response.status}`);
  }
  return (await response.json()) as VillagerCard;
}

async function postJson(path: string, body?: unknown): Promise<unknown> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(error?.error ?? `POST ${path} failed: ${response.status}`);
  }
  return response.json();
}

/** Spec section 15's one-click thanks: their mood lifts, and they remember it. */
export function useThankVillager() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (villagerId: string) =>
      postJson(`/api/villagers/${encodeURIComponent(villagerId)}/thank`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['villager'] });
      void queryClient.invalidateQueries({ queryKey: ['village'] });
    },
  });
}

/** Spec section 15's work-along: a finished focus session, for the chronicle. */
export function useFinishFocusSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (minutes: number) => postJson('/api/work-along', { minutes }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['village'] });
    },
  });
}

/** The owner pins a note on the notice board. */
export function usePinNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (text: string) => postJson('/api/board', { text }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['village'] });
    },
  });
}

/** Marks a promise kept, or lets the villager off it. */
export function useDecidePromise() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { promiseId: number; decision: 'kept' | 'released' }) =>
      postJson(`/api/promises/${input.promiseId}`, { decision: input.decision }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['villager'] });
      void queryClient.invalidateQueries({ queryKey: ['village'] });
    },
  });
}

/** Kept current by the live updates, which refetch it as the village changes. */
export function useVillagerCard(villagerId: string) {
  return useQuery({
    queryKey: ['villager', villagerId],
    queryFn: () => fetchVillagerCard(villagerId),
  });
}
