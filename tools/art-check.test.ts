import { describe, expect, it } from 'vitest';
import {
  checkArtCredits,
  formatProblem,
  isAllowedLicence,
  parseArtCredits,
  type ArtCreditRow,
} from './art-check.js';

describe('parseArtCredits', () => {
  it('parses rows, skipping the header and separator', () => {
    const markdown = `
# Art credits

| File | Source | Licence |
| ---- | ------ | ------- |
| tiles/foo.png | Some Pack | CC0 |
| tiles/bar.png | Another Pack | CC-BY 4.0 |
`;
    expect(parseArtCredits(markdown)).toEqual([
      { file: 'tiles/foo.png', source: 'Some Pack', licence: 'CC0' },
      { file: 'tiles/bar.png', source: 'Another Pack', licence: 'CC-BY 4.0' },
    ]);
  });

  it('returns nothing for an empty table', () => {
    const markdown = `
| File | Source | Licence |
| ---- | ------ | ------- |
`;
    expect(parseArtCredits(markdown)).toEqual([]);
  });

  it('ignores non-table lines', () => {
    const markdown = `
Every art and sound file used in the build is listed here.

| File | Source | Licence |
| ---- | ------ | ------- |
| tiles/foo.png | Some Pack | CC0 |
`;
    expect(parseArtCredits(markdown)).toEqual([
      { file: 'tiles/foo.png', source: 'Some Pack', licence: 'CC0' },
    ]);
  });
});

describe('isAllowedLicence', () => {
  it.each([
    'CC0',
    'CC0 1.0',
    'CC-BY',
    'CC-BY 4.0',
    'CC-BY 4.0 (credit LimeZu)',
    'OFL',
    "The project's own",
  ])('allows "%s"', (licence) => {
    expect(isAllowedLicence(licence)).toBe(true);
  });

  it.each(['Proprietary', 'All rights reserved', 'CC-BY-NC', 'CC-BY-NC 4.0'])(
    'rejects "%s"',
    (licence) => {
      expect(isAllowedLicence(licence)).toBe(false);
    },
  );
});

describe('checkArtCredits', () => {
  const goodCredit: ArtCreditRow = {
    file: 'tiles/foo.png',
    source: 'Some Pack',
    licence: 'CC0',
  };

  it('reports no problems when every file is documented with an allowed licence', () => {
    expect(checkArtCredits(['tiles/foo.png'], [goodCredit])).toEqual([]);
  });

  it('reports nothing for an empty art/src and an empty credits table', () => {
    expect(checkArtCredits([], [])).toEqual([]);
  });

  it('flags a file in art/src with no credits row', () => {
    expect(checkArtCredits(['tiles/foo.png'], [])).toEqual([
      { kind: 'undocumented', file: 'tiles/foo.png' },
    ]);
  });

  it('flags a credits row whose file is missing from art/src', () => {
    expect(checkArtCredits([], [goodCredit])).toEqual([
      { kind: 'missing-file', file: 'tiles/foo.png' },
    ]);
  });

  it('flags a disallowed licence', () => {
    const badCredit: ArtCreditRow = { ...goodCredit, licence: 'All rights reserved' };
    expect(checkArtCredits(['tiles/foo.png'], [badCredit])).toEqual([
      { kind: 'disallowed-licence', file: 'tiles/foo.png', licence: 'All rights reserved' },
    ]);
  });
});

describe('formatProblem', () => {
  it('formats each problem kind readably', () => {
    expect(formatProblem({ kind: 'undocumented', file: 'a.png' })).toContain('not listed');
    expect(formatProblem({ kind: 'missing-file', file: 'a.png' })).toContain(
      'missing from art/src',
    );
    expect(
      formatProblem({ kind: 'disallowed-licence', file: 'a.png', licence: 'Proprietary' }),
    ).toContain('Proprietary');
  });
});
