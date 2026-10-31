import { createVillage, getBalance, type Order, type VillageState } from '@ai-village/sim';
import { describe, expect, it } from 'vitest';
import {
  ACCEPT_ORDER_TOOL,
  CALL_VOTE_TOOL,
  DECLINE_ORDER_TOOL,
  GIFT_TOOL,
  POST_ON_BOARD_TOOL,
  PROMISE_TOOL,
  PROPOSE_BUILDING_TOOL,
  REMEMBER_TOOL,
  SIM_TOOLS,
} from './sim-tools.js';
import { resolveVillagerTools, ToolRegistry } from './tools.js';

function villageWithOrder(): VillageState {
  const village = createVillage(1);
  const order: Order = {
    id: 1,
    source: 'downriver',
    items: [{ good: 'bread', qty: 10 }],
    reward: 20,
    dueDay: 20,
    status: 'pending',
  };
  return { ...village, orders: { orders: [order], nextId: 2 } };
}

describe('GIFT_TOOL', () => {
  it('runs the GiveGift command against the sim state', () => {
    const village = createVillage(1, {
      villagers: [
        { villagerId: 'ada', tradeId: 'farmer', skillLevel: 1, hasTool: false, moodFactor: 1 },
        { villagerId: 'tobin', tradeId: 'baker', skillLevel: 1, hasTool: false, moodFactor: 1 },
      ],
      startingStock: [{ account: 'villager:ada', item: 'bread', qty: 2 }],
    });

    const args = GIFT_TOOL.args.parse({ from: 'ada', to: 'tobin', item: 'bread', qty: 1 });
    const result = GIFT_TOOL.run?.(args, { state: village }) as {
      state: typeof village;
      events: unknown[];
    };

    expect(getBalance(result.state.ledger, 'villager:tobin', 'bread')).toBe(1);
    expect(result.events).toEqual([
      { kind: 'GiftGiven', from: 'ada', to: 'tobin', item: 'bread', qty: 1 },
    ]);
  });

  it('is a risk-none game action granted to the Villager role', () => {
    expect(GIFT_TOOL.kind).toBe('game');
    expect(GIFT_TOOL.risk).toBe('none');
    const registry = new ToolRegistry();
    registry.register(GIFT_TOOL);
    expect(resolveVillagerTools(registry, 'villager', [])).toEqual(['gift']);
  });

  it('previews the gift in plain language', () => {
    expect(GIFT_TOOL.preview?.({ from: 'ada', to: 'tobin', item: 'bread', qty: 2 })).toBe(
      'Give tobin 2 bread',
    );
  });
});

describe('PROPOSE_BUILDING_TOOL', () => {
  it('runs the ProposeBuilding command against the sim state', () => {
    const village = createVillage(1, {
      startingStock: [{ account: 'treasury', item: 'coins', qty: 100 }],
    });

    const args = PROPOSE_BUILDING_TOOL.args.parse({ buildingId: 'fields' });
    const result = PROPOSE_BUILDING_TOOL.run?.(args, { state: village }) as {
      state: typeof village;
      events: unknown[];
    };

    expect(result.state.builtBuildingIds).toContain('fields');
    expect(result.events).toEqual([{ kind: 'BuildingFinished', buildingId: 'fields' }]);
  });

  it('is a risk-none game action granted to the Mayor role', () => {
    expect(PROPOSE_BUILDING_TOOL.kind).toBe('game');
    expect(PROPOSE_BUILDING_TOOL.risk).toBe('none');
    const registry = new ToolRegistry();
    registry.register(PROPOSE_BUILDING_TOOL);
    expect(resolveVillagerTools(registry, 'mayor', [])).toEqual(['propose_building']);
  });
});

describe('ACCEPT_ORDER_TOOL', () => {
  it('runs the AcceptOrder command against the sim state', () => {
    const village = villageWithOrder();
    const args = ACCEPT_ORDER_TOOL.args.parse({ orderId: 1 });
    const result = ACCEPT_ORDER_TOOL.run?.(args, { state: village }) as {
      state: typeof village;
      events: unknown[];
    };

    expect(result.state.orders.orders[0]?.status).toBe('accepted');
    expect(result.events).toEqual([{ kind: 'OrderAccepted', orderId: 1 }]);
  });

  it('is a risk-none game action granted to the Mayor role', () => {
    expect(ACCEPT_ORDER_TOOL.kind).toBe('game');
    expect(ACCEPT_ORDER_TOOL.risk).toBe('none');
    const registry = new ToolRegistry();
    registry.register(ACCEPT_ORDER_TOOL);
    expect(resolveVillagerTools(registry, 'mayor', [])).toEqual(['accept_order']);
  });
});

describe('DECLINE_ORDER_TOOL', () => {
  it('runs the DeclineOrder command against the sim state', () => {
    const village = villageWithOrder();
    const args = DECLINE_ORDER_TOOL.args.parse({ orderId: 1 });
    const result = DECLINE_ORDER_TOOL.run?.(args, { state: village }) as {
      state: typeof village;
      events: unknown[];
    };

    expect(result.state.orders.orders[0]?.status).toBe('declined');
    expect(result.events).toEqual([{ kind: 'OrderDeclined', orderId: 1 }]);
  });
});

describe('POST_ON_BOARD_TOOL', () => {
  it('runs the PostOnBoard command against the sim state', () => {
    const village = createVillage(1, {
      villagers: [
        { villagerId: 'ada', tradeId: 'farmer', skillLevel: 1, hasTool: false, moodFactor: 1 },
      ],
    });
    const args = POST_ON_BOARD_TOOL.args.parse({ author: 'ada', text: 'Hello.' });
    const result = POST_ON_BOARD_TOOL.run?.(args, { state: village }) as {
      state: typeof village;
      events: unknown[];
    };

    expect(result.state.board.posts).toMatchObject([{ author: 'ada', text: 'Hello.' }]);
    expect(result.events).toEqual([{ kind: 'PostedOnBoard', postId: 1 }]);
  });

  it('is a risk-none game action granted to the Villager role', () => {
    expect(POST_ON_BOARD_TOOL.kind).toBe('game');
    expect(POST_ON_BOARD_TOOL.risk).toBe('none');
    const registry = new ToolRegistry();
    registry.register(POST_ON_BOARD_TOOL);
    expect(resolveVillagerTools(registry, 'villager', [])).toEqual(['post_on_board']);
  });
});

describe('CALL_VOTE_TOOL', () => {
  it('runs the CallVote command against the sim state', () => {
    const village = createVillage(1, {
      villagers: [
        { villagerId: 'ada', tradeId: 'farmer', skillLevel: 1, hasTool: false, moodFactor: 1 },
      ],
    });
    const args = CALL_VOTE_TOOL.args.parse({ topic: 'Name the boat', options: ['Swift', 'Merry'] });
    const result = CALL_VOTE_TOOL.run?.(args, { state: village }) as {
      state: typeof village;
      events: { kind: string; winner: string }[];
    };

    expect(result.events[0]?.kind).toBe('VoteResolved');
    expect(['Swift', 'Merry']).toContain(result.events[0]?.winner);
  });

  it('is a risk-none game action granted to the Mayor role', () => {
    expect(CALL_VOTE_TOOL.kind).toBe('game');
    expect(CALL_VOTE_TOOL.risk).toBe('none');
    const registry = new ToolRegistry();
    registry.register(CALL_VOTE_TOOL);
    expect(resolveVillagerTools(registry, 'mayor', [])).toEqual(['call_vote']);
  });
});

describe('REMEMBER_TOOL', () => {
  it('runs the Remember command against the sim state', () => {
    const village = createVillage(1, {
      villagers: [
        { villagerId: 'ada', tradeId: 'farmer', skillLevel: 1, hasTool: false, moodFactor: 1 },
      ],
    });
    const args = REMEMBER_TOOL.args.parse({
      villagerId: 'ada',
      text: 'Met Tobin at the market.',
      importance: 6,
    });
    const result = REMEMBER_TOOL.run?.(args, { state: village }) as {
      state: typeof village;
      events: unknown[];
    };

    expect(result.state.memory.memories[0]?.text).toBe('Met Tobin at the market.');
    expect(result.events).toEqual([{ kind: 'Remembered', memoryId: 1 }]);
  });

  it('is a risk-none game action granted to the Villager role', () => {
    expect(REMEMBER_TOOL.kind).toBe('game');
    expect(REMEMBER_TOOL.risk).toBe('none');
    const registry = new ToolRegistry();
    registry.register(REMEMBER_TOOL);
    expect(resolveVillagerTools(registry, 'villager', [])).toEqual(['remember']);
  });
});

describe('PROMISE_TOOL', () => {
  it('runs the MakePromise command against the sim state', () => {
    const village = createVillage(1, {
      villagers: [
        { villagerId: 'ada', tradeId: 'farmer', skillLevel: 1, hasTool: false, moodFactor: 1 },
      ],
    });
    const args = PROMISE_TOOL.args.parse({
      villagerId: 'ada',
      text: 'Finish the fence',
      dueInDays: 5,
    });
    const result = PROMISE_TOOL.run?.(args, { state: village }) as {
      state: typeof village;
      events: unknown[];
    };

    expect(result.state.promises.promises[0]?.text).toBe('Finish the fence');
    expect(result.events).toEqual([{ kind: 'PromiseMade', promiseId: 1 }]);
  });

  it('is a risk-none game action granted to the Villager role', () => {
    expect(PROMISE_TOOL.kind).toBe('game');
    expect(PROMISE_TOOL.risk).toBe('none');
    const registry = new ToolRegistry();
    registry.register(PROMISE_TOOL);
    expect(resolveVillagerTools(registry, 'villager', [])).toEqual(['promise']);
  });
});

describe('SIM_TOOLS', () => {
  it('contains every sim tool with unique ids', () => {
    expect(new Set(SIM_TOOLS.map((tool) => tool.id))).toEqual(
      new Set([
        'gift',
        'propose_building',
        'accept_order',
        'decline_order',
        'post_on_board',
        'call_vote',
        'remember',
        'promise',
      ]),
    );
  });
});
