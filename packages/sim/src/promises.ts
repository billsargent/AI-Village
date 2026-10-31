/**
 * Promises a villager makes to the owner (spec section 15: "when a
 * villager promises the owner something, it becomes a tracked promise
 * with a due date and a reminder"), made by the `promise` tool.
 */

export const PROMISE_STATUSES = ['open', 'kept', 'released'] as const;
export type PromiseStatus = (typeof PROMISE_STATUSES)[number];

export interface VillagerPromise {
  id: number;
  villagerId: string;
  text: string;
  createdMinute: number;
  dueMinute: number;
  status: PromiseStatus;
}

export interface PromisesState {
  promises: readonly VillagerPromise[];
  nextId: number;
}

export function createPromisesState(): PromisesState {
  return { promises: [], nextId: 1 };
}

export function makePromise(
  state: PromisesState,
  entry: { villagerId: string; text: string; createdMinute: number; dueMinute: number },
): PromisesState {
  const promise: VillagerPromise = { id: state.nextId, status: 'open', ...entry };
  return { promises: [...state.promises, promise], nextId: state.nextId + 1 };
}

export function decidePromise(
  state: PromisesState,
  id: number,
  decision: Extract<PromiseStatus, 'kept' | 'released'>,
): PromisesState {
  return {
    ...state,
    promises: state.promises.map((promise) =>
      promise.id === id ? { ...promise, status: decision } : promise,
    ),
  };
}

/** True once an open promise's due day has passed without being kept or released. */
export function isOverdue(promise: VillagerPromise, nowMinute: number): boolean {
  return promise.status === 'open' && nowMinute > promise.dueMinute;
}
