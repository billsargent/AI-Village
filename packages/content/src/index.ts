// Goods, trades, buildings, traits and happenings live here as data files
// with zod schemas (spec section 5-7). This package depends on nothing
// else in the workspace; festivals, names, playbooks and prices follow.

export const CONTENT_PACKAGE_VERSION = '0.0.0';

export * from './goods.js';
export * from './trades.js';
export * from './buildings.js';
export * from './traits.js';
export * from './roles.js';
export * from './prices.js';
export * from './happenings.js';
