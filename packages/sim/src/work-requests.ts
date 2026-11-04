/**
 * Queued work-session requests (spec section 11: "`request_work` queues
 * a work session ... and the villager says it's queued"). Chat never
 * runs real tools itself - this only records that a work session was
 * asked for. Actually running one is the separate "Work session"
 * purpose (work model, thinking on, 30 steps, the villager's role's
 * tools) spec section 11's table names but this project hasn't built
 * yet - a queue with nothing yet consuming it, not faked as "done".
 */

export interface WorkRequest {
  id: number;
  villagerId: string;
  description: string;
  requestedMinute: number;
}

export interface WorkRequestQueue {
  requests: readonly WorkRequest[];
  nextId: number;
}

export function createWorkRequestQueue(): WorkRequestQueue {
  return { requests: [], nextId: 1 };
}

export function queueWorkRequest(
  queue: WorkRequestQueue,
  villagerId: string,
  description: string,
  minute: number,
): WorkRequestQueue {
  const request: WorkRequest = {
    id: queue.nextId,
    villagerId,
    description,
    requestedMinute: minute,
  };
  return { requests: [...queue.requests, request], nextId: queue.nextId + 1 };
}
