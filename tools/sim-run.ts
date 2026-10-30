#!/usr/bin/env node
// Headless sim runner (spec section 3 and 18): `pnpm sim run --days N --seed S`.
// No network calls, no model calls - just the deterministic systems.

import { runVillageDays } from '@ai-village/sim';

function parseArg(flag: string, fallback: number): number {
  const index = process.argv.indexOf(flag);
  if (index === -1 || !process.argv[index + 1]) {
    return fallback;
  }
  const value = Number(process.argv[index + 1]);
  return Number.isFinite(value) ? value : fallback;
}

const days = parseArg('--days', 30);
const seed = parseArg('--seed', 1);

const start = performance.now();
const { reports } = runVillageDays(seed, days);
const elapsedMs = performance.now() - start;

const weatherCounts = new Map<string, number>();
for (const report of reports) {
  weatherCounts.set(report.weather.kind, (weatherCounts.get(report.weather.kind) ?? 0) + 1);
}

const last = reports.at(-1);

console.log(`AI-Village headless sim: seed ${seed}, ${days} village days`);
console.log(`Ran in ${elapsedMs.toFixed(1)}ms`);
if (last) {
  console.log(
    `Ended on ${last.date.weekday}, ${last.date.season} day ${last.date.seasonDay}, year ${last.date.year}`,
  );
}
console.log('Weather days:');
for (const [kind, count] of weatherCounts) {
  console.log(`  ${kind}: ${count}`);
}
