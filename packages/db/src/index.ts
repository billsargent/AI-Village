// Drizzle schema, migrations and repositories (spec section 4). Opened only
// by the server; scripts work on a copy or go through the server.

export const DB_PACKAGE_VERSION = '0.0.0';

export * from './schema.js';
export * from './client.js';
export * from './village-repository.js';
