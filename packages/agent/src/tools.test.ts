import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { defineTool, resolveVillagerTools, ToolRegistry } from './tools.js';

function makeTool(id: string, roles: readonly string[]) {
  return defineTool({
    id,
    title: id,
    kind: 'game',
    risk: 'none',
    approval: 'never',
    roles,
    purposes: ['chat'],
    costUsd: 0,
    args: z.object({}),
  });
}

describe('ToolRegistry', () => {
  it('registers and looks up tools by id', () => {
    const registry = new ToolRegistry();
    const tool = makeTool('gift', ['villager']);
    registry.register(tool);
    expect(registry.get('gift')).toBe(tool);
    expect(registry.get('missing')).toBeUndefined();
  });

  it('refuses to register the same id twice', () => {
    const registry = new ToolRegistry();
    registry.register(makeTool('gift', ['villager']));
    expect(() => {
      registry.register(makeTool('gift', ['villager']));
    }).toThrow();
  });

  it('filters tools by role', () => {
    const registry = new ToolRegistry();
    registry.register(makeTool('gift', ['villager']));
    registry.register(makeTool('propose_hire', ['mayor']));
    expect(registry.forRole('villager').map((t) => t.id)).toEqual(['gift']);
    expect(registry.forRole('mayor').map((t) => t.id)).toEqual(['propose_hire']);
  });
});

describe('resolveVillagerTools', () => {
  it("starts from the role's defaults", () => {
    const registry = new ToolRegistry();
    registry.register(makeTool('gift', ['villager']));
    registry.register(makeTool('remember', ['villager']));
    const tools = resolveVillagerTools(registry, 'villager', []);
    expect(new Set(tools)).toEqual(new Set(['gift', 'remember']));
  });

  it("adds a grant beyond the role's defaults", () => {
    const registry = new ToolRegistry();
    registry.register(makeTool('gift', ['villager']));
    registry.register(makeTool('web_search', ['librarian']));
    const tools = resolveVillagerTools(registry, 'villager', [{ tool: 'web_search', grant: '+' }]);
    expect(new Set(tools)).toEqual(new Set(['gift', 'web_search']));
  });

  it('removes a default via a revoke', () => {
    const registry = new ToolRegistry();
    registry.register(makeTool('gift', ['villager']));
    registry.register(makeTool('remember', ['villager']));
    const tools = resolveVillagerTools(registry, 'villager', [{ tool: 'remember', grant: '-' }]);
    expect(tools).toEqual(['gift']);
  });

  it('drops a grant/revoke naming a tool that no longer exists, without failing', () => {
    const registry = new ToolRegistry();
    registry.register(makeTool('gift', ['villager']));
    const tools = resolveVillagerTools(registry, 'villager', [
      { tool: 'long_removed_tool', grant: '+' },
    ]);
    expect(tools).toEqual(['gift']);
  });
});
