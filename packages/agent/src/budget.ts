/**
 * Budgets (spec section 16): "budgets are checked before a call is
 * made." Of the six budgets the spec names, two are checkable against
 * what exists today - the monthly ceiling and the (off-by-default)
 * per-villager-per-day cap. The daily soft budget, the village-chatter
 * share and the per-work-session ask each gate purposes (`ambient`,
 * `work`) that aren't built yet, so there's nothing real to enforce for
 * them - left out rather than faked.
 */

import { costSince, type Meter } from './meter.js';

export interface BudgetSettings {
  monthlyCeilingUsd: number;
  /** Off (`null`) by default (spec section 16). */
  perVillagerPerDayUsd: number | null;
  /** Removes every limit except the monthly ceiling (spec section 16). */
  noLimits: boolean;
}

export function defaultBudgetSettings(monthlyCeilingUsd: number): BudgetSettings {
  return { monthlyCeilingUsd, perVillagerPerDayUsd: null, noLimits: false };
}

export type BudgetCheck =
  { ok: true } | { ok: false; reason: 'monthly-ceiling' | 'per-villager-per-day' };

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DAYS_PER_MONTH = 30;

/**
 * Whether a call for `purpose` (and, if given, `villagerId`) may
 * proceed right now. The owner's own chat (`purpose === 'chat'`) is
 * never blocked by the monthly ceiling - spec: "everything stops except
 * the owner's own chats."
 */
export function checkBudget(
  meter: Meter,
  settings: BudgetSettings,
  purpose: string,
  villagerId: string | null,
  nowMs: number,
): BudgetCheck {
  if (purpose !== 'chat') {
    const monthSpend = costSince(meter, nowMs - DAYS_PER_MONTH * MS_PER_DAY);
    if (monthSpend >= settings.monthlyCeilingUsd) {
      return { ok: false, reason: 'monthly-ceiling' };
    }
  }

  if (settings.noLimits) {
    return { ok: true };
  }

  if (settings.perVillagerPerDayUsd !== null && villagerId) {
    const dayStart = nowMs - MS_PER_DAY;
    const villagerDaySpend = meter
      .filter((record) => record.at >= dayStart && record.villagerId === villagerId)
      .reduce((sum, record) => sum + record.costUsd, 0);
    if (villagerDaySpend >= settings.perVillagerPerDayUsd) {
      return { ok: false, reason: 'per-villager-per-day' };
    }
  }

  return { ok: true };
}
