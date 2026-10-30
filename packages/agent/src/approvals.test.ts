import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { needsApproval } from './approvals.js';
import { defineTool, type ToolRisk } from './tools.js';

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
