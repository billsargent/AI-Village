import { describe, expect, it } from 'vitest';
import { createWorkRequestQueue, queueWorkRequest } from './work-requests.js';

describe('createWorkRequestQueue', () => {
  it('starts empty', () => {
    expect(createWorkRequestQueue()).toEqual({ requests: [], nextId: 1 });
  });
});

describe('queueWorkRequest', () => {
  it('appends a request with an incrementing id', () => {
    let queue = createWorkRequestQueue();
    queue = queueWorkRequest(queue, 'ada', 'Weed the north field', 120);
    queue = queueWorkRequest(queue, 'tobin', 'Bake extra bread for market day', 480);

    expect(queue.requests).toEqual([
      { id: 1, villagerId: 'ada', description: 'Weed the north field', requestedMinute: 120 },
      {
        id: 2,
        villagerId: 'tobin',
        description: 'Bake extra bread for market day',
        requestedMinute: 480,
      },
    ]);
    expect(queue.nextId).toBe(3);
  });
});
