import { z } from 'zod';

/**
 * A thin client for DeepSeek's OpenAI-compatible chat completions API
 * (spec section 11's default talk model). The API key and `fetch`
 * implementation are both passed in rather than read from the
 * environment or called directly, so this is fully testable with no
 * network access and no real key - this package is the only one that
 * talks to the outside world (spec section 2), and that boundary should
 * be easy to fake in a test.
 */

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatCompletionOptions {
  model: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ChatCompletionUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ChatCompletionResult {
  text: string;
  usage: ChatCompletionUsage;
}

const deepSeekResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({ content: z.string() }),
      }),
    )
    .min(1),
  usage: z.object({
    prompt_tokens: z.number(),
    completion_tokens: z.number(),
    total_tokens: z.number(),
  }),
});

export interface DeepSeekClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface DeepSeekClient {
  chatCompletion(
    messages: readonly ChatMessage[],
    options: ChatCompletionOptions,
  ): Promise<ChatCompletionResult>;
}

const DEFAULT_BASE_URL = 'https://api.deepseek.com';

export function createDeepSeekClient(options: DeepSeekClientOptions): DeepSeekClient {
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async chatCompletion(messages, chatOptions) {
      const response = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${options.apiKey}`,
        },
        body: JSON.stringify({
          model: chatOptions.model,
          messages,
          temperature: chatOptions.temperature,
          max_tokens: chatOptions.maxTokens,
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`DeepSeek request failed (${response.status}): ${body}`);
      }

      const parsed = deepSeekResponseSchema.parse(await response.json());
      const choice = parsed.choices[0];
      if (!choice) {
        throw new Error('DeepSeek response had no choices');
      }

      return {
        text: choice.message.content,
        usage: {
          promptTokens: parsed.usage.prompt_tokens,
          completionTokens: parsed.usage.completion_tokens,
          totalTokens: parsed.usage.total_tokens,
        },
      };
    },
  };
}
