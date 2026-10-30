import { describe, expect, it } from 'vitest';
import { appendChronicle, publicChronicle, type Chronicle } from './chronicle.js';

describe('chronicle', () => {
  it('appends entries keeping order', () => {
    let chronicle: Chronicle = [];
    chronicle = appendChronicle(chronicle, {
      minute: 0,
      kind: 'test',
      text: 'first',
      actors: [],
      importance: 1,
      public: true,
    });
    chronicle = appendChronicle(chronicle, {
      minute: 60,
      kind: 'test',
      text: 'second',
      actors: [],
      importance: 1,
      public: false,
    });
    expect(chronicle.map((entry) => entry.text)).toEqual(['first', 'second']);
  });

  it('filters to public entries only', () => {
    const chronicle: Chronicle = [
      { minute: 0, kind: 'test', text: 'public one', actors: [], importance: 1, public: true },
      { minute: 1, kind: 'test', text: 'private one', actors: [], importance: 1, public: false },
    ];
    expect(publicChronicle(chronicle).map((entry) => entry.text)).toEqual(['public one']);
  });
});
