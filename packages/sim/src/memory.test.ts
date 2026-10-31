import { describe, expect, it } from 'vitest';
import { MINUTES_PER_DAY } from './calendar.js';
import { addMemory, createMemoryState, topMemoriesFor } from './memory.js';

describe('addMemory', () => {
  it('stores a memory with an increasing id', () => {
    let state = createMemoryState();
    state = addMemory(state, { villagerId: 'ada', minute: 0, text: 'Met Tobin.', importance: 5 });
    state = addMemory(state, {
      villagerId: 'ada',
      minute: 60,
      text: 'Baked bread.',
      importance: 3,
    });

    expect(state.memories).toEqual([
      {
        id: 1,
        villagerId: 'ada',
        minute: 0,
        text: 'Met Tobin.',
        importance: 5,
        about: null,
        lastRecalledMinute: null,
      },
      {
        id: 2,
        villagerId: 'ada',
        minute: 60,
        text: 'Baked bread.',
        importance: 3,
        about: null,
        lastRecalledMinute: null,
      },
    ]);
  });

  it('clamps importance to 1-10', () => {
    let state = createMemoryState();
    state = addMemory(state, { villagerId: 'ada', minute: 0, text: 'x', importance: 20 });
    state = addMemory(state, { villagerId: 'ada', minute: 0, text: 'y', importance: -5 });
    expect(state.memories[0]?.importance).toBe(10);
    expect(state.memories[1]?.importance).toBe(1);
  });

  it('tags a memory about the owner, for the owner file', () => {
    let state = createMemoryState();
    state = addMemory(state, {
      villagerId: 'ada',
      minute: 0,
      text: 'The owner likes honey.',
      importance: 4,
      about: 'owner',
    });
    expect(state.memories[0]?.about).toBe('owner');
  });
});

describe('topMemoriesFor', () => {
  it("only returns one villager's memories", () => {
    let state = createMemoryState();
    state = addMemory(state, { villagerId: 'ada', minute: 0, text: 'a', importance: 5 });
    state = addMemory(state, { villagerId: 'tobin', minute: 0, text: 'b', importance: 5 });
    expect(topMemoriesFor(state, 'ada', 0).map((m) => m.text)).toEqual(['a']);
  });

  it('ranks a more important memory above a less important one at the same time', () => {
    let state = createMemoryState();
    state = addMemory(state, { villagerId: 'ada', minute: 0, text: 'minor', importance: 2 });
    state = addMemory(state, { villagerId: 'ada', minute: 0, text: 'major', importance: 9 });
    expect(topMemoriesFor(state, 'ada', 0).map((m) => m.text)).toEqual(['major', 'minor']);
  });

  it('ranks a recent memory above an old one of the same importance', () => {
    let state = createMemoryState();
    state = addMemory(state, { villagerId: 'ada', minute: 0, text: 'old', importance: 5 });
    state = addMemory(state, {
      villagerId: 'ada',
      minute: 100 * MINUTES_PER_DAY,
      text: 'recent',
      importance: 5,
    });
    expect(topMemoriesFor(state, 'ada', 100 * MINUTES_PER_DAY).map((m) => m.text)).toEqual([
      'recent',
      'old',
    ]);
  });

  it('caps the result at the given limit, defaulting to 6', () => {
    let state = createMemoryState();
    for (let i = 0; i < 10; i++) {
      state = addMemory(state, { villagerId: 'ada', minute: i, text: `m${i}`, importance: 5 });
    }
    expect(topMemoriesFor(state, 'ada', 10)).toHaveLength(6);
    expect(topMemoriesFor(state, 'ada', 10, 3)).toHaveLength(3);
  });
});
