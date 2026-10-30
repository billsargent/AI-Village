import { z } from 'zod';

/** Game actions change only the sim; read never waits; real has an effect outside the app (spec section 12). */
export const TOOL_KINDS = ['game', 'read', 'real'] as const;
export type ToolKind = (typeof TOOL_KINDS)[number];

export const TOOL_RISKS = ['none', 'low', 'medium', 'high'] as const;
export type ToolRisk = (typeof TOOL_RISKS)[number];

export const TOOL_APPROVAL_MODES = ['never', 'per-session', 'each-time'] as const;
export type ToolApprovalMode = (typeof TOOL_APPROVAL_MODES)[number];

// Registries and lookups hold many tools with different Args shapes
// together, so their element type is deliberately `ToolDefinition` (Args
// defaulting to `any`) rather than `unknown`: a registry is exactly the
// case where erasing each tool's specific Args type is the point.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ToolDefinition<Args = any> {
  id: string;
  title: string;
  kind: ToolKind;
  risk: ToolRisk;
  approval: ToolApprovalMode;
  roles: readonly string[];
  purposes: readonly string[];
  costUsd: number;
  args: z.ZodType<Args>;
  /** Builds a human-readable preview of what running the tool would do; absent for tools with nothing to preview. */
  preview?: (args: Args) => string;
  /** Not implemented yet: real tool bodies land once `integrations` has something for them to call. */
  run?: (args: Args) => unknown;
  undo?: (record: unknown) => unknown;
}

/** Declares one tool. Spec section 12: "The registry is the only list of tools." */
export function defineTool<Args>(definition: ToolDefinition<Args>): ToolDefinition<Args> {
  return definition;
}

export class ToolRegistry {
  private readonly byId = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): void {
    if (this.byId.has(tool.id)) {
      throw new Error(`Tool "${tool.id}" is already registered`);
    }
    this.byId.set(tool.id, tool);
  }

  get(id: string): ToolDefinition | undefined {
    return this.byId.get(id);
  }

  all(): readonly ToolDefinition[] {
    return [...this.byId.values()];
  }

  forRole(role: string): readonly ToolDefinition[] {
    return this.all().filter((tool) => tool.roles.includes(role));
  }
}

export interface RoleToolGrant {
  tool: string;
  /** '+' grants the tool beyond the role's defaults; '-' revokes a default. */
  grant: '+' | '-';
}

/**
 * A villager's tools are their role's defaults, plus grants, minus
 * revokes (spec section 12). A grant/revoke naming a tool the registry no
 * longer has is dropped silently - "it never makes a save fail."
 */
export function resolveVillagerTools(
  registry: ToolRegistry,
  role: string,
  grants: readonly RoleToolGrant[],
): readonly string[] {
  const ids = new Set(registry.forRole(role).map((tool) => tool.id));

  for (const grant of grants) {
    if (!registry.get(grant.tool)) {
      continue;
    }
    if (grant.grant === '+') {
      ids.add(grant.tool);
    } else {
      ids.delete(grant.tool);
    }
  }

  return [...ids];
}
