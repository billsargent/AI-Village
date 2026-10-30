// The deterministic village: clock, calendar, weather, ledger, economy,
// needs, schedules, relationships, happenings, chronicle (spec section 5+).
// Exposes facts() and apply(command) to the agent layer; never imports it.

export const SIM_PACKAGE_VERSION = '0.0.0';

export * from './random.js';
export * from './clock.js';
export * from './calendar.js';
export * from './weather.js';
export * from './ledger.js';
export * from './needs.js';
export * from './eating.js';
export * from './work.js';
export * from './upkeep.js';
export * from './prices.js';
export * from './chronicle.js';
export * from './relationships.js';
export * from './storyteller.js';
export * from './orders.js';
export * from './systems.js';
export * from './commands.js';
