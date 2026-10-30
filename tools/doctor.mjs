#!/usr/bin/env node
// Checks the local environment before running the app. Grows as packages land
// (keychain, database, providers, disk space); for now it only checks Node.

const REQUIRED_MAJOR = 24;

const [major] = process.versions.node.split('.').map(Number);

if (major !== REQUIRED_MAJOR) {
  console.error(
    `AI-Village needs Node ${REQUIRED_MAJOR}.x, found ${process.versions.node}. ` +
      `Use nvm/fnm with the repo's .nvmrc.`,
  );
  process.exitCode = 1;
} else {
  console.log(`Node ${process.versions.node} OK.`);
}
