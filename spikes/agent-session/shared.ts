// Shared helpers for the agent-session spike.
// - Two fake in-process MCP tools via tool() + createSdkMcpServer()
// - A push-driven AsyncIterable<SDKUserMessage> queue so we can keep ONE live
//   session and feed it messages one at a time, waiting for each turn's result.

import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import type { SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

// --- Fake MCP tools (in-process) -------------------------------------------

const FAKE_SELECTION = {
  componentName: 'PrimaryButton',
  file: 'src/components/PrimaryButton.tsx',
  line: 42,
  kind: 'button',
};

const FAKE_SOURCE = `export function PrimaryButton({ label, onClick }: Props) {
  return <button className="btn-primary" onClick={onClick}>{label}</button>;
}`;

export const fieldsdkServer = createSdkMcpServer({
  name: 'fieldsdk',
  version: '0.0.0',
  tools: [
    tool(
      'get_selection',
      'Return the component currently selected in the editor (name, file, line).',
      {},
      async () => ({
        content: [{ type: 'text', text: JSON.stringify(FAKE_SELECTION) }],
      }),
    ),
    tool(
      'get_component_source',
      'Return the source code of a component given its file path.',
      { file: z.string().describe('File path of the component') },
      async () => ({
        content: [{ type: 'text', text: FAKE_SOURCE }],
      }),
    ),
  ],
});

// --- Push-driven message queue ---------------------------------------------

export function createMessageQueue() {
  const items: SDKUserMessage[] = [];
  let resolveNext: ((r: IteratorResult<SDKUserMessage>) => void) | null = null;
  let closed = false;

  function push(text: string) {
    const msg: SDKUserMessage = {
      type: 'user',
      parent_tool_use_id: null,
      message: { role: 'user', content: text },
    } as SDKUserMessage;
    if (resolveNext) {
      const r = resolveNext;
      resolveNext = null;
      r({ value: msg, done: false });
    } else {
      items.push(msg);
    }
  }

  function close() {
    closed = true;
    if (resolveNext) {
      const r = resolveNext;
      resolveNext = null;
      r({ value: undefined as unknown as SDKUserMessage, done: true });
    }
  }

  const iterable: AsyncIterable<SDKUserMessage> = {
    [Symbol.asyncIterator]() {
      return {
        next(): Promise<IteratorResult<SDKUserMessage>> {
          if (items.length > 0) {
            return Promise.resolve({ value: items.shift()!, done: false });
          }
          if (closed) {
            return Promise.resolve({ value: undefined as unknown as SDKUserMessage, done: true });
          }
          return new Promise((resolve) => {
            resolveNext = resolve;
          });
        },
      };
    },
  };

  return { iterable, push, close };
}

// --- Usage row helpers ------------------------------------------------------

export interface UsageRow {
  session: string; // "s1" | "s2"
  turn: number; // sequential prompt index
  prompt: string;
  input_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  output_tokens: number;
  total_cost_usd: number;
  num_turns: number;
  answer: string;
}

export function markdownTable(rows: UsageRow[]): string {
  const header =
    '| # | prompt | input | cache_creation | cache_read | output | cost_usd | num_turns |';
  const sep = '|---|---|---|---|---|---|---|---|';
  const body = rows.map(
    (r) =>
      `| ${r.session}.${r.turn} | ${r.prompt.slice(0, 34)} | ${r.input_tokens} | ${r.cache_creation_input_tokens} | ${r.cache_read_input_tokens} | ${r.output_tokens} | ${r.total_cost_usd.toFixed(6)} | ${r.num_turns} |`,
  );
  return [header, sep, ...body].join('\n');
}
