import { createVillage, getBalance } from '@ai-village/sim';
import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import {
  createApprovalsInbox,
  decideApproval,
  needsApproval,
  requestApproval,
  type ApprovalsInbox,
} from './approvals.js';
import { GIFT_TOOL } from './sim-tools.js';
import { defineTool, ToolRegistry, type ToolRisk } from './tools.js';

function toolWithRisk(risk: ToolRisk) {
  return defineTool({
    id: 'write_file',
    title: 'Write a file',
    kind: 'real',
    risk,
    approval: 'per-session',
    roles: ['clerk'],
    purposes: ['work'],
    costUsd: 0,
    args: z.object({}),
  });
}

describe('needsApproval', () => {
  it('never needs approval for none or low risk tools', () => {
    expect(needsApproval(toolWithRisk('none'), { tainted: true }, new Set())).toBe(false);
    expect(needsApproval(toolWithRisk('low'), { tainted: true }, new Set())).toBe(false);
  });

  it('always needs approval for high risk tools, even untainted and granted', () => {
    const tool = toolWithRisk('high');
    expect(needsApproval(tool, { tainted: false }, new Set(['write_file']))).toBe(true);
  });

  it('skips approval for a medium-risk tool only when untainted and granted this session', () => {
    const tool = toolWithRisk('medium');
    expect(needsApproval(tool, { tainted: false }, new Set(['write_file']))).toBe(false);
  });

  it('always needs approval for a medium-risk tool once the turn is tainted, regardless of grants', () => {
    const tool = toolWithRisk('medium');
    expect(needsApproval(tool, { tainted: true }, new Set(['write_file']))).toBe(true);
  });

  it("needs approval for a medium-risk tool that hasn't been granted this session", () => {
    const tool = toolWithRisk('medium');
    expect(needsApproval(tool, { tainted: false }, new Set())).toBe(true);
  });
});

function villageWithGiftableStock() {
  return createVillage(1, {
    villagers: [
      { villagerId: 'ada', tradeId: 'farmer', skillLevel: 1, hasTool: false, moodFactor: 1 },
      { villagerId: 'tobin', tradeId: 'baker', skillLevel: 1, hasTool: false, moodFactor: 1 },
    ],
    startingStock: [{ account: 'villager:ada', item: 'bread', qty: 2 }],
  });
}

describe('requestApproval', () => {
  it('queues a pending request with an increasing id and a rendered preview', () => {
    let inbox = createApprovalsInbox();
    const args = { from: 'ada', to: 'tobin', item: 'bread', qty: 1 };

    const first = requestApproval(inbox, GIFT_TOOL, args, 'ada', 1000);
    inbox = first.inbox;
    const second = requestApproval(inbox, GIFT_TOOL, args, 'ada', 2000);

    expect(first.request).toMatchObject({
      id: 1,
      toolId: 'gift',
      args,
      risk: 'none',
      preview: 'Give tobin 1 bread',
      requestedBy: 'ada',
      status: 'pending',
      createdAt: 1000,
    });
    expect(second.request.id).toBe(2);
    expect(second.inbox.requests).toHaveLength(2);
  });

  it("falls back to a null preview if the tool's preview throws on malformed args", () => {
    const { request } = requestApproval(createApprovalsInbox(), GIFT_TOOL, null, 'ada', 0);
    expect(request.preview).toBeNull();
  });
});

describe('decideApproval', () => {
  function registryWithGiftTool(): ToolRegistry {
    const registry = new ToolRegistry();
    registry.register(GIFT_TOOL);
    return registry;
  }

  it('runs the tool and applies its outcome when approved', () => {
    const village = villageWithGiftableStock();
    const registry = registryWithGiftTool();
    const { inbox } = requestApproval(
      createApprovalsInbox(),
      GIFT_TOOL,
      { from: 'ada', to: 'tobin', item: 'bread', qty: 1 },
      'ada',
      0,
    );

    const result = decideApproval(inbox, registry, 1, 'approved', village);

    expect(result.inbox.requests[0]?.status).toBe('approved');
    expect(getBalance(result.state.ledger, 'villager:tobin', 'bread')).toBe(1);
    expect(result.events).toEqual([
      { kind: 'GiftGiven', from: 'ada', to: 'tobin', item: 'bread', qty: 1 },
    ]);
  });

  it('only records the decision, without changing state, when declined', () => {
    const village = villageWithGiftableStock();
    const registry = registryWithGiftTool();
    const { inbox } = requestApproval(
      createApprovalsInbox(),
      GIFT_TOOL,
      { from: 'ada', to: 'tobin', item: 'bread', qty: 1 },
      'ada',
      0,
    );

    const result = decideApproval(inbox, registry, 1, 'declined', village);

    expect(result.inbox.requests[0]?.status).toBe('declined');
    expect(result.state).toBe(village);
    expect(result.events).toEqual([]);
  });

  it('rejects an unknown approval id', () => {
    const village = villageWithGiftableStock();
    expect(() =>
      decideApproval(createApprovalsInbox(), registryWithGiftTool(), 99, 'approved', village),
    ).toThrow(/Unknown approval/);
  });

  it('rejects deciding on a request that was already decided', () => {
    const village = villageWithGiftableStock();
    const registry = registryWithGiftTool();
    const { inbox } = requestApproval(
      createApprovalsInbox(),
      GIFT_TOOL,
      { from: 'ada', to: 'tobin', item: 'bread', qty: 1 },
      'ada',
      0,
    );
    const decided = decideApproval(inbox, registry, 1, 'declined', village).inbox;

    expect(() => decideApproval(decided, registry, 1, 'approved', village)).toThrow(
      /already declined/,
    );
  });
});

describe('ApprovalsInbox', () => {
  it('starts empty', () => {
    const inbox: ApprovalsInbox = createApprovalsInbox();
    expect(inbox.requests).toEqual([]);
    expect(inbox.nextId).toBe(1);
  });
});
