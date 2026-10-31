import type { DomainEvent, VillageState } from '@ai-village/sim';
import type { ToolDefinition, ToolRegistry, ToolRisk, ToolRunContext } from './tools.js';

export interface TurnState {
  /**
   * Once a turn has read a web page, an email or a file it didn't write,
   * it's tainted for the rest of the turn (spec section 12). This blunts
   * prompt injection: a tainted turn can't ride on standing permissions.
   */
  tainted: boolean;
}

/**
 * Decides whether running `tool` needs the owner's approval right now
 * (spec section 12's "how a real action is decided"):
 *
 * - none/low risk: never (game actions and reads don't wait).
 * - high risk: always.
 * - medium risk: only skipped when the turn is untainted AND the owner
 *   has already approved this tool for the session.
 */
export function needsApproval(
  tool: ToolDefinition,
  turn: TurnState,
  sessionApprovedToolIds: ReadonlySet<string>,
): boolean {
  if (tool.risk === 'none' || tool.risk === 'low') {
    return false;
  }
  if (tool.risk === 'high') {
    return true;
  }
  // medium
  if (turn.tainted) {
    return true;
  }
  return !sessionApprovedToolIds.has(tool.id);
}

export const APPROVAL_STATUSES = ['pending', 'approved', 'declined'] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

/** One queued tool call awaiting the owner's decision (spec section 4's `approvals` table). */
export interface ApprovalRequest {
  id: number;
  toolId: string;
  args: unknown;
  risk: ToolRisk;
  preview: string | null;
  requestedBy: string;
  status: ApprovalStatus;
  createdAt: number;
}

export interface ApprovalsInbox {
  requests: readonly ApprovalRequest[];
  nextId: number;
}

export function createApprovalsInbox(): ApprovalsInbox {
  return { requests: [], nextId: 1 };
}

/** Queues a tool call for the owner to decide, rather than running it or dropping it. */
export function requestApproval(
  inbox: ApprovalsInbox,
  tool: ToolDefinition,
  args: unknown,
  requestedBy: string,
  at: number,
): { inbox: ApprovalsInbox; request: ApprovalRequest } {
  let preview: string | null = null;
  if (tool.preview) {
    try {
      preview = tool.preview(args);
    } catch {
      // Malformed args from a model-generated call still deserve a queued
      // record the owner can see; just skip the preview for this one.
      preview = null;
    }
  }

  const request: ApprovalRequest = {
    id: inbox.nextId,
    toolId: tool.id,
    args,
    risk: tool.risk,
    preview,
    requestedBy,
    status: 'pending',
    createdAt: at,
  };

  return {
    inbox: { requests: [...inbox.requests, request], nextId: inbox.nextId + 1 },
    request,
  };
}

export interface DecideApprovalResult {
  inbox: ApprovalsInbox;
  state: VillageState;
  events: readonly DomainEvent[];
}

/**
 * Applies the owner's decision. Declining just records it; approving runs
 * the tool now, against the current state - there's no attempt to resume
 * the stalled turn that originally asked, since that turn may be long
 * over by the time the owner decides. This matches how every other
 * command already works: one action, one transaction, independent of any
 * particular conversation.
 */
export function decideApproval(
  inbox: ApprovalsInbox,
  registry: ToolRegistry,
  id: number,
  decision: Extract<ApprovalStatus, 'approved' | 'declined'>,
  state: VillageState,
): DecideApprovalResult {
  const request = inbox.requests.find((candidate) => candidate.id === id);
  if (!request) {
    throw new Error(`Unknown approval #${id}`);
  }
  if (request.status !== 'pending') {
    throw new Error(`Approval #${id} was already ${request.status}`);
  }

  const nextInbox: ApprovalsInbox = {
    ...inbox,
    requests: inbox.requests.map((candidate) =>
      candidate.id === id ? { ...candidate, status: decision } : candidate,
    ),
  };

  if (decision === 'declined') {
    return { inbox: nextInbox, state, events: [] };
  }

  const tool = registry.get(request.toolId);
  if (!tool?.run) {
    return { inbox: nextInbox, state, events: [] };
  }

  const runContext: ToolRunContext = { state };
  const outcome = tool.run(request.args, runContext) as
    { state: VillageState; events: readonly DomainEvent[] } | undefined;
  if (!outcome) {
    return { inbox: nextInbox, state, events: [] };
  }

  return { inbox: nextInbox, state: outcome.state, events: outcome.events };
}
