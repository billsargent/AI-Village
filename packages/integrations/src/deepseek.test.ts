import { describe, expect, it } from 'vitest';
import { createDeepSeekClient } from './deepseek.js';

interface FakeResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}

function fakeFetch(body: unknown, ok = true, status = 200): typeof fetch {
  const response: FakeResponse = {
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  };
  return (() => Promise.resolve(response)) as unknown as typeof fetch;
}

describe('createDeepSeekClient', () => {
  it('parses a chat completion response, with no real network call', async () => {
    const client = createDeepSeekClient({
      apiKey: 'test-key',
      fetchImpl: fakeFetch({
        choices: [{ message: { content: 'Good morning!' } }],
        usage: { prompt_tokens: 10, completion_tokens: 3, total_tokens: 13 },
      }),
    });

    const result = await client.chatCompletion([{ role: 'user', content: 'Hi' }], {
      model: 'deepseek-chat',
    });

    expect(result.text).toBe('Good morning!');
    expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 3, totalTokens: 13 });
  });

  it('sends the request to the DeepSeek chat completions endpoint with the given key', async () => {
    const calls: { url: string; body: string }[] = [];
    const fetchImpl = ((url: string, init: { headers: Record<string, string>; body: string }) => {
      calls.push({ url, body: init.body });
      expect(init.headers.Authorization).toBe('Bearer secret');
      const response: FakeResponse = {
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: 'ok' } }],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          }),
        text: () => Promise.resolve(''),
      };
      return Promise.resolve(response as unknown as Response);
    }) as unknown as typeof fetch;

    const client = createDeepSeekClient({ apiKey: 'secret', fetchImpl });
    await client.chatCompletion([{ role: 'user', content: 'Hi' }], { model: 'deepseek-chat' });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://api.deepseek.com/chat/completions');
    const body = JSON.parse(calls[0]?.body ?? '{}') as { model: string; messages: unknown };
    expect(body.model).toBe('deepseek-chat');
    expect(body.messages).toEqual([{ role: 'user', content: 'Hi' }]);
  });

  it('throws with the response body when the request fails', async () => {
    const client = createDeepSeekClient({
      apiKey: 'test-key',
      fetchImpl: fakeFetch({ error: 'bad request' }, false, 400),
    });

    await expect(
      client.chatCompletion([{ role: 'user', content: 'Hi' }], { model: 'deepseek-chat' }),
    ).rejects.toThrow(/400/);
  });

  it("throws if the response doesn't match the expected shape", async () => {
    const client = createDeepSeekClient({
      apiKey: 'test-key',
      fetchImpl: fakeFetch({ nonsense: true }),
    });

    await expect(
      client.chatCompletion([{ role: 'user', content: 'Hi' }], { model: 'deepseek-chat' }),
    ).rejects.toThrow();
  });

  it('parses tool calls from the response, with a null content', async () => {
    const client = createDeepSeekClient({
      apiKey: 'test-key',
      fetchImpl: fakeFetch({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                { id: 'call_1', function: { name: 'gift', arguments: '{"to":"tobin"}' } },
              ],
            },
          },
        ],
        usage: { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 },
      }),
    });

    const result = await client.chatCompletion([{ role: 'user', content: 'Give Tobin a gift' }], {
      model: 'deepseek-chat',
    });

    expect(result.text).toBe('');
    expect(result.toolCalls).toEqual([{ id: 'call_1', name: 'gift', arguments: '{"to":"tobin"}' }]);
  });

  it('sends tools, assistant tool-call messages and tool-reply messages in the wire format', async () => {
    const calls: { body: string }[] = [];
    const fetchImpl = ((_url: string, init: { body: string }) => {
      calls.push({ body: init.body });
      const response: FakeResponse = {
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: 'Done.' } }],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          }),
        text: () => Promise.resolve(''),
      };
      return Promise.resolve(response as unknown as Response);
    }) as unknown as typeof fetch;

    const client = createDeepSeekClient({ apiKey: 'secret', fetchImpl });
    await client.chatCompletion(
      [
        { role: 'user', content: 'Give Tobin a gift' },
        {
          role: 'assistant',
          content: null,
          toolCalls: [{ id: 'call_1', name: 'gift', arguments: '{"to":"tobin"}' }],
        },
        { role: 'tool', content: 'ok', toolCallId: 'call_1' },
      ],
      {
        model: 'deepseek-chat',
        tools: [{ name: 'gift', description: 'Give a gift', parameters: { type: 'object' } }],
      },
    );

    const body = JSON.parse(calls[0]?.body ?? '{}') as {
      messages: unknown[];
      tools: unknown[];
    };
    expect(body.tools).toEqual([
      {
        type: 'function',
        function: { name: 'gift', description: 'Give a gift', parameters: { type: 'object' } },
      },
    ]);
    expect(body.messages[1]).toEqual({
      role: 'assistant',
      content: null,
      tool_calls: [
        { id: 'call_1', type: 'function', function: { name: 'gift', arguments: '{"to":"tobin"}' } },
      ],
    });
    expect(body.messages[2]).toEqual({ role: 'tool', tool_call_id: 'call_1', content: 'ok' });
  });
});
