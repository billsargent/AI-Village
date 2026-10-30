import { createVillage, getBalance, type Order, type VillageState } from '@ai-village/sim';
import { describe, expect, it } from 'vitest';
import {
  ACCEPT_ORDER_TOOL,
  DECLINE_ORDER_TOOL,
  GIFT_TOOL,
  PROPOSE_BUILDING_TOOL,
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

describe('SIM_TOOLS', () => {
  it('contains every sim tool with unique ids', () => {
    expect(new Set(SIM_TOOLS.map((tool) => tool.id))).toEqual(
      new Set(['gift', 'propose_building', 'accept_order', 'decline_order']),
    );
  });
});
