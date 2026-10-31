import type { ChatCompletionResult, ChatMessage, ToolSchema } from '@ai-village/integrations';
import type { DomainEvent, VillageState } from '@ai-village/sim';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  needsApproval,
  requestApproval,
  type ApprovalsInbox,
  type TurnState,
} from './approvals.js';
import { renderFacts, type FactsSnapshot } from './facts.js';
import { appendMeterRecord, type Meter, type MeterRecord } from './meter.js';
import { modelSettingsFor } from './models.js';
import type { ToolDefinition, ToolRunContext } from './tools.js';

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

export interface VillagerCard {
  id: string;
  tradeId: string;
}

/** Spec section 11's charter rules, trimmed to what a one-line chat turn needs. */
export const CHARTER_LINE =
  'Answer the question first, in one sentence. Use 1-3 sentences unless asked for more. ' +
  'Plain words, no proverbs or riddles. Never invent facts about the village - if unsure, say so.';

export interface RunChatResult {
  reply: string;
  meter: Meter;
}

/**
 * Runs one chat turn: a static charter line, the facts block, and the
 * request, sent to the chat purpose's model. Records a meter entry.
 * Pricing is 0 for now - the cost table lands with the cost/budget work
 * (spec section 16), not here.
 */
export async function runChat(
  client: ModelClient,
  facts: FactsSnapshot,
  villager: VillagerCard,
  request: string,
  meter: Meter = [],
): Promise<RunChatResult> {
  const settings = modelSettingsFor('chat');

  const messages: ChatMessage[] = [
    { role: 'system', content: CHARTER_LINE },
    { role: 'system', content: renderFacts(facts) },
    { role: 'user', content: request },
  ];

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
    costUsd: 0,
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
): Promise<RunTurnResult> {
  const settings = modelSettingsFor('chat');
  const toolSchemas = ctx.tools.map(toToolSchema);

  const messages: ChatMessage[] = [
    { role: 'system', content: CHARTER_LINE },
    { role: 'system', content: renderFacts(facts) },
    { role: 'user', content: request },
  ];

  let state = ctx.state;
  let currentMeter = meter;
  let currentInbox = ctx.inbox;
  const events: DomainEvent[] = [];

  for (let step = 0; step < settings.maxSteps; step++) {
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
      costUsd: 0,
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
