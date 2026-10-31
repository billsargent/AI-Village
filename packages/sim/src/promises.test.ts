import { describe, expect, it } from 'vitest';
import { createPromisesState, decidePromise, isOverdue, makePromise } from './promises.js';

describe('makePromise', () => {
  it('stores an open promise with an increasing id', () => {
    let state = createPromisesState();
    state = makePromise(state, {
      villagerId: 'ada',
      text: 'Finish the fence',
      createdMinute: 0,
      dueMinute: 1440,
    });

    expect(state.promises).toEqual([
      {
        id: 1,
        villagerId: 'ada',
        text: 'Finish the fence',
        createdMinute: 0,
        dueMinute: 1440,
        status: 'open',
      },
    ]);
  });
});

describe('decidePromise', () => {
  it('marks a promise kept or released, leaving others untouched', () => {
    let state = createPromisesState();
    state = makePromise(state, { villagerId: 'ada', text: 'a', createdMinute: 0, dueMinute: 10 });
    state = makePromise(state, { villagerId: 'ada', text: 'b', createdMinute: 0, dueMinute: 10 });

    state = decidePromise(state, 1, 'kept');

    expect(state.promises[0]?.status).toBe('kept');
    expect(state.promises[1]?.status).toBe('open');
  });
});

describe('isOverdue', () => {
  it('is true only for an open promise past its due day', () => {
    const open = {
      id: 1,
      villagerId: 'ada',
      text: 'x',
      createdMinute: 0,
      dueMinute: 100,
      status: 'open' as const,
    };
    expect(isOverdue(open, 50)).toBe(false);
    expect(isOverdue(open, 150)).toBe(true);
    expect(isOverdue({ ...open, status: 'kept' }, 150)).toBe(false);
  });
});
