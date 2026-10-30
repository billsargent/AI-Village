import type { ToolDefinition } from './tools.js';

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
