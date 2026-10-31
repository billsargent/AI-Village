#!/usr/bin/env node
// `pnpm art:check` (spec section 10): walks art/src for real and checks
// it against docs/ART_CREDITS.md using art-check.ts's pure logic.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { checkArtCredits, formatProblem, parseArtCredits } from './art-check.js';

const ROOT = join(import.meta.dirname, '..');
const ART_SRC_DIR = join(ROOT, 'art', 'src');
const CREDITS_PATH = join(ROOT, 'docs', 'ART_CREDITS.md');

function listFilesRecursively(dir: string): string[] {
  let entries: string[] = [];
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  for (const name of names) {
    const fullPath = join(dir, name);
    if (statSync(fullPath).isDirectory()) {
      entries = entries.concat(listFilesRecursively(fullPath));
    } else {
      entries.push(fullPath);
    }
  }
  return entries;
}

const artSrcFiles = listFilesRecursively(ART_SRC_DIR).map((path) =>
  relative(ART_SRC_DIR, path).split('\\').join('/'),
);
const credits = parseArtCredits(readFileSync(CREDITS_PATH, 'utf8'));

const problems = checkArtCredits(artSrcFiles, credits);

if (problems.length > 0) {
  console.error(`art:check found ${problems.length} problem(s):`);
  for (const problem of problems) {
    console.error(`  - ${formatProblem(problem)}`);
  }
  process.exit(1);
}

console.log(`art:check: ${artSrcFiles.length} file(s) in art/src, all accounted for.`);
