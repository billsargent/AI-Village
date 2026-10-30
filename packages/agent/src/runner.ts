import type { ChatCompletionResult, ChatMessage } from '@ai-village/integrations';
import { renderFacts, type FactsSnapshot } from './facts.js';
import { appendMeterRecord, type Meter, type MeterRecord } from './meter.js';
import { modelSettingsFor } from './models.js';

/**
 * What `runChat` needs from a model client - matches
 * `@ai-village/integrations`'s `DeepSeekClient`, but kept as its own
 * minimal shape here so this module takes any client with a
 * `chatCompletion`, not specifically a DeepSeek one.
 */
export interface ModelClient {
  chatCompletion(
    messages: readonly ChatMessage[],
    options: { model: string; temperature?: number; maxTokens?: number },
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
