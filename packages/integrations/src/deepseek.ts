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

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

/** One tool call the model asked for, or the client's own record of one it already made. */
export interface ToolCall {
  id: string;
  name: string;
  /** Raw JSON string, exactly as the wire format carries it - parsing is the caller's job. */
  arguments: string;
}

export interface ChatMessage {
  role: ChatRole;
  /** Null when an assistant message is tool calls only, with nothing said. */
  content: string | null;
  /** Only on an assistant message that's asking for one or more tool calls. */
  toolCalls?: readonly ToolCall[];
  /** Only on a `tool` message: which call this is the result of. */
  toolCallId?: string;
}

/** A tool the model may call, as JSON Schema - the caller converts from its own tool's zod schema, not this package's job. */
export interface ToolSchema {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ChatCompletionOptions {
  model: string;
  temperature?: number;
  maxTokens?: number;
  tools?: readonly ToolSchema[];
}

export interface ChatCompletionUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ChatCompletionResult {
  text: string;
  usage: ChatCompletionUsage;
  /** Present when the model wants to call one or more tools instead of (or alongside) replying. */
  toolCalls?: readonly ToolCall[];
}

const toolCallResponseSchema = z.object({
  id: z.string(),
  function: z.object({ name: z.string(), arguments: z.string() }),
});

const deepSeekResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string().nullable(),
          tool_calls: z.array(toolCallResponseSchema).optional(),
        }),
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

/** Maps one message to the wire's snake_case shape, including tool calls and tool replies. */
function toWireMessage(message: ChatMessage): Record<string, unknown> {
  if (message.role === 'tool') {
    return { role: 'tool', tool_call_id: message.toolCallId, content: message.content };
  }
  if (message.toolCalls) {
    return {
      role: message.role,
      content: message.content,
      tool_calls: message.toolCalls.map((toolCall) => ({
        id: toolCall.id,
        type: 'function',
        function: { name: toolCall.name, arguments: toolCall.arguments },
      })),
    };
  }
  return { role: message.role, content: message.content };
}

function toWireTool(tool: ToolSchema): Record<string, unknown> {
  return {
    type: 'function',
    function: { name: tool.name, description: tool.description, parameters: tool.parameters },
  };
}

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
          messages: messages.map(toWireMessage),
          temperature: chatOptions.temperature,
          max_tokens: chatOptions.maxTokens,
          tools: chatOptions.tools?.map(toWireTool),
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

      const toolCalls = choice.message.tool_calls?.map((toolCall) => ({
        id: toolCall.id,
        name: toolCall.function.name,
        arguments: toolCall.function.arguments,
      }));

      return {
        text: choice.message.content ?? '',
        usage: {
          promptTokens: parsed.usage.prompt_tokens,
          completionTokens: parsed.usage.completion_tokens,
          totalTokens: parsed.usage.total_tokens,
        },
        ...(toolCalls ? { toolCalls } : {}),
      };
    },
  };
}
