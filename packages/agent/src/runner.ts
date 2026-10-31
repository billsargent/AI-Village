import type { ChatCompletionResult, ChatMessage, ToolSchema } from '@ai-village/integrations';
import type { DomainEvent, VillageState } from '@ai-village/sim';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  needsApproval,
  requestApproval,
  type ApprovalsInbox,
  type TurnState,
} from './approvals.js';
import { checkBudget, type BudgetCheck, type BudgetSettings } from './budget.js';
import type { FactsSnapshot } from './facts.js';
import { appendMeterRecord, computeCostUsd, type Meter, type MeterRecord } from './meter.js';
import { modelSettingsFor } from './models.js';
import { buildPromptMessages, type PromptOptions, type VillagerCard } from './prompt.js';
import type { ToolDefinition, ToolRunContext } from './tools.js';

/** Why a call was skipped instead of made (spec section 16). */
export type BudgetExceededReason = Extract<BudgetCheck, { ok: false }>['reason'];

/** The slots of the prompt layout a caller supplies, besides the villager/facts/request (spec section 11). */
export type PromptExtras = Pick<
  PromptOptions,
  'memoriesText' | 'peopleHereText' | 'olderSummary' | 'history'
>;

/**
 * What `runChat`/`runTurn` need from a model client - matches
 * `@ai-village/integrations`'s `DeepSeekClient`, but kept as its own
 * minimal shape here so this module takes any client with a
 * `chatCompletion`, not specifically a DeepSeek one.
 */
export interface ModelClient {
  chatCompletion(
    messages: readonly ChatMessage[],
    options: {
      model: string;
      temperature?: number;
      maxTokens?: number;
      tools?: readonly ToolSchema[];
    },
  ): Promise<ChatCompletionResult>;
}

export interface RunChatResult {
  reply: string;
  meter: Meter;
  /** Set instead of calling the model, when `budgetSettings` blocks this call (spec section 16). */
  budgetExceeded?: BudgetExceededReason;
}

/**
 * Runs one chat turn: the full prompt layout (spec section 11) ending
 * with the request, sent to the chat purpose's model. Records a meter
 * entry with its real $ cost. When `budgetSettings` is given and the
 * call would exceed it, the model is never called - see `checkBudget`
 * for what's actually enforced today.
 */
export async function runChat(
  client: ModelClient,
  facts: FactsSnapshot,
  villager: VillagerCard,
  request: string,
  meter: Meter = [],
  promptExtras: PromptExtras = {},
  budgetSettings?: BudgetSettings,
): Promise<RunChatResult> {
  const settings = modelSettingsFor('chat');

  if (budgetSettings) {
    const budget = checkBudget(meter, budgetSettings, 'chat', villager.id, Date.now());
    if (!budget.ok) {
      return { reply: '', meter, budgetExceeded: budget.reason };
    }
  }

  const messages = buildPromptMessages({ villager, facts, request, ...promptExtras });

  const startedAt = Date.now();
  const result = await client.chatCompletion(messages, {
    model: settings.model,
    temperature: settings.temperature,
  });
  const ms = Date.now() - startedAt;

  const record: MeterRecord = {
    at: startedAt,
    purpose: 'chat',
    villagerId: villager.id,
    model: settings.model,
    tokensIn: result.usage.promptTokens,
    tokensCached: 0,
    tokensOut: result.usage.completionTokens,
    tokensReasoning: 0,
    costUsd: computeCostUsd(
      settings.model,
      result.usage.promptTokens,
      0,
      result.usage.completionTokens,
      0,
    ),
    ms,
  };

  return { reply: result.text, meter: appendMeterRecord(meter, record) };
}

function toToolSchema(tool: ToolDefinition): ToolSchema {
  return {
    name: tool.id,
    description: tool.title,
    parameters: zodToJsonSchema(tool.args, { target: 'openApi3' }),
  };
}

export interface TurnContext {
  state: VillageState;
  /** The villager's tools, already resolved for their role and this purpose. */
  tools: readonly ToolDefinition[];
  turn: TurnState;
  sessionApprovedToolIds: ReadonlySet<string>;
  inbox: ApprovalsInbox;
}

export interface RunTurnResult {
  reply: string;
  meter: Meter;
  state: VillageState;
  events: readonly DomainEvent[];
  /**
   * Carries forward `ctx.inbox`, with a new pending request appended if a
   * step's tool call needed the owner's approval. The turn stops there
   * and reports it rather than running the tool or guessing an answer -
   * see `decideApproval` for how the owner's decision later runs it.
   */
  inbox: ApprovalsInbox;
  /** Set if the model never settled on a final reply within the purpose's maxSteps. */
  ranOutOfSteps?: boolean;
  /** Set when `budgetSettings` blocks a step instead of calling the model (spec section 16). */
  budgetExceeded?: BudgetExceededReason;
}

/**
 * Runs one chat turn with tools (spec section 11: the `chat` purpose gets
 * game actions, up to 4 steps). Each step calls the model with the
 * villager's tools; a plain reply ends the turn, a tool call runs
 * through the registry's `run()` (which calls the sim's `apply()`) and
 * feeds the result back as a `tool` message, and the loop repeats until
 * a reply comes back or `maxSteps` runs out.
 */
export async function runTurn(
  client: ModelClient,
  facts: FactsSnapshot,
  villager: VillagerCard,
  request: string,
  ctx: TurnContext,
  meter: Meter = [],
  promptExtras: PromptExtras = {},
  budgetSettings?: BudgetSettings,
): Promise<RunTurnResult> {
  const settings = modelSettingsFor('chat');
  const toolSchemas = ctx.tools.map(toToolSchema);

  const messages = buildPromptMessages({ villager, facts, request, ...promptExtras });

  let state = ctx.state;
  let currentMeter = meter;
  let currentInbox = ctx.inbox;
  const events: DomainEvent[] = [];

  for (let step = 0; step < settings.maxSteps; step++) {
    if (budgetSettings) {
      const budget = checkBudget(currentMeter, budgetSettings, 'chat', villager.id, Date.now());
      if (!budget.ok) {
        return {
          reply: '',
          meter: currentMeter,
          state,
          events,
          inbox: currentInbox,
          budgetExceeded: budget.reason,
        };
      }
    }

    const startedAt = Date.now();
    const result = await client.chatCompletion(messages, {
      model: settings.model,
      temperature: settings.temperature,
      ...(toolSchemas.length > 0 ? { tools: toolSchemas } : {}),
    });
    const ms = Date.now() - startedAt;

    currentMeter = appendMeterRecord(currentMeter, {
      at: startedAt,
      purpose: 'chat',
      villagerId: villager.id,
      model: settings.model,
      tokensIn: result.usage.promptTokens,
      tokensCached: 0,
      tokensOut: result.usage.completionTokens,
      tokensReasoning: 0,
      costUsd: computeCostUsd(
        settings.model,
        result.usage.promptTokens,
        0,
        result.usage.completionTokens,
        0,
      ),
      ms,
    });

    if (!result.toolCalls || result.toolCalls.length === 0) {
      return { reply: result.text, meter: currentMeter, state, events, inbox: currentInbox };
    }

    messages.push({
      role: 'assistant',
      content: result.text.length > 0 ? result.text : null,
      toolCalls: result.toolCalls,
    });

    for (const call of result.toolCalls) {
      const tool = ctx.tools.find((candidate) => candidate.id === call.name);
      if (!tool) {
        messages.push({
          role: 'tool',
          toolCallId: call.id,
          content: `Unknown tool "${call.name}"`,
        });
        continue;
      }

      if (needsApproval(tool, ctx.turn, ctx.sessionApprovedToolIds)) {
        let args: unknown = call.arguments;
        try {
          args = tool.args.parse(JSON.parse(call.arguments));
        } catch {
          try {
            args = JSON.parse(call.arguments);
          } catch {
            // Leave args as the raw string; this is only for reporting.
          }
        }
        const requested = requestApproval(currentInbox, tool, args, villager.id, Date.now());
        return {
          reply: '',
          meter: currentMeter,
          state,
          events,
          inbox: requested.inbox,
        };
      }

      try {
        const args: unknown = tool.args.parse(JSON.parse(call.arguments));
        const runContext: ToolRunContext = { state };
        const outcome = tool.run?.(args, runContext) as
          { state: VillageState; events: readonly DomainEvent[] } | undefined;
        if (outcome) {
          state = outcome.state;
          events.push(...outcome.events);
        }
        messages.push({ role: 'tool', toolCallId: call.id, content: 'ok' });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        messages.push({ role: 'tool', toolCallId: call.id, content: `Error: ${reason}` });
      }
    }
  }

  return {
    reply: '',
    meter: currentMeter,
    state,
    events,
    inbox: currentInbox,
    ranOutOfSteps: true,
  };
}
