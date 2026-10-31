// Pure logic for `pnpm art:check` (spec section 10): every file under
// art/src must be listed in docs/ART_CREDITS.md with an allowed licence,
// and every listed file must actually exist. Split from art-check-cli.ts
// so this can be unit tested without touching the real filesystem.

export interface ArtCreditRow {
  file: string;
  source: string;
  licence: string;
}

/** Parses docs/ART_CREDITS.md's `| File | Source | Licence |` table. */
export function parseArtCredits(markdown: string): ArtCreditRow[] {
  const rows: ArtCreditRow[] = [];
  for (const line of markdown.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) {
      continue;
    }
    const cells = trimmed
      .slice(1, -1)
      .split('|')
      .map((cell) => cell.trim());
    if (cells.length !== 3) {
      continue;
    }
    const [file, source, licence] = cells as [string, string, string];
    if (file.length === 0 || file === 'File' || /^-+$/.test(file)) {
      continue;
    }
    rows.push({ file, source, licence });
  }
  return rows;
}

/**
 * Spec section 10: "its licence isn't CC0, CC-BY or OFL" - plus the
 * project's own hand-made work, which the same section's sources table
 * lists as a fourth source ("The project's own") the prose doesn't
 * mention. Licence strings may carry a version/credit suffix, e.g.
 * "CC-BY 4.0 (credit LimeZu)", so this matches by prefix.
 */
// A word boundary after the prefix, so "CC-BY-NC" (non-commercial - a
// much more restrictive licence) doesn't match plain "CC-BY".
const ALLOWED_LICENCE_PATTERNS = [/^CC0(\s|$)/, /^CC-BY(\s|$)/, /^OFL(\s|$)/];
export const PROJECT_OWN_LICENCE = "The project's own";

export function isAllowedLicence(licence: string): boolean {
  if (licence === PROJECT_OWN_LICENCE) {
    return true;
  }
  return ALLOWED_LICENCE_PATTERNS.some((pattern) => pattern.test(licence));
}

export type ArtCheckProblem =
  | { kind: 'undocumented'; file: string }
  | { kind: 'missing-file'; file: string }
  | { kind: 'disallowed-licence'; file: string; licence: string };

/** Checks every file actually under art/src against docs/ART_CREDITS.md's rows. */
export function checkArtCredits(
  artSrcFiles: readonly string[],
  credits: readonly ArtCreditRow[],
): ArtCheckProblem[] {
  const problems: ArtCheckProblem[] = [];
  const byFile = new Map(credits.map((row) => [row.file, row]));

  for (const file of artSrcFiles) {
    const row = byFile.get(file);
    if (!row) {
      problems.push({ kind: 'undocumented', file });
      continue;
    }
    if (!isAllowedLicence(row.licence)) {
      problems.push({ kind: 'disallowed-licence', file, licence: row.licence });
    }
  }

  const artSrcSet = new Set(artSrcFiles);
  for (const row of credits) {
    if (!artSrcSet.has(row.file)) {
      problems.push({ kind: 'missing-file', file: row.file });
    }
  }

  return problems;
}

export function formatProblem(problem: ArtCheckProblem): string {
  switch (problem.kind) {
    case 'undocumented':
      return `${problem.file}: not listed in docs/ART_CREDITS.md`;
    case 'missing-file':
      return `${problem.file}: listed in docs/ART_CREDITS.md but missing from art/src`;
    case 'disallowed-licence':
      return `${problem.file}: licence "${problem.licence}" isn't CC0, CC-BY, OFL or the project's own`;
  }
}
