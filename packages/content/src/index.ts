// Goods, trades, buildings, traits and happenings live here as data files
// with zod schemas (spec section 5-7). This package depends on nothing
// else in the workspace; playbooks follow.

export const CONTENT_PACKAGE_VERSION = '0.0.0';

export * from './goods.js';
export * from './trades.js';
export * from './buildings.js';
export * from './traits.js';
export * from './roles.js';
export * from './prices.js';
export * from './layout.js';
export * from './sprites.js';
export * from './interiors.js';
export * from './happenings.js';
export * from './names.js';
export * from './terrain.js';
export * from './whereabouts.js';
export * from './paths.js';
export * from './cat.js';
export * from './chickens.js';
export * from './small-talk.js';
