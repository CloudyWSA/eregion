// Spike session 1: ONE live Claude Agent SDK session, 6 short messages.
// Captures usage per turn, exercises the fake MCP tools, persists sessionId.
// Auth: relies on the machine's Claude Code login. NO ANTHROPIC_API_KEY.

import { query } from '@anthropic-ai/claude-agent-sdk';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  fieldsdkServer,
  createMessageQueue,
  markdownTable,
  type UsageRow,
} from './shared.js';

const HERE = new URL('.', import.meta.url).pathname;

if (process.env.ANTHROPIC_API_KEY) {
  console.error('ABORT: ANTHROPIC_API_KEY is set; spike must use Claude Code login.');
  process.exit(1);
}

const PROMPTS = [
  'What component is currently selected? Use your tools. Answer in one short line.',
  'Show me its source code using your tools. One short sentence describing it.',
  'In one short sentence, what does this component do?',
  'What file and line was the selection at? One line.',
  'Reply with only the word: ok',
  'One word: was a button or a card selected?',
];

async function main() {
  const q = createMessageQueue();
  const rows: UsageRow[] = [];
  let sessionId = '';
  let sentCount = 0;
  let accountLogged = false;

  const stream = query({
    prompt: q.iterable,
    options: {
      cwd: HERE,
      systemPrompt: {
        type: 'preset',
        preset: 'claude_code',
        append:
          'You are a spike test agent. Keep every answer under 20 words. Use the fieldsdk MCP tools when asked about the selected component.',
      },
      permissionMode: 'acceptEdits',
      includePartialMessages: false,
      model: 'haiku',
      maxTurns: 10,
      mcpServers: { fieldsdk: fieldsdkServer },
      allowedTools: [
        'mcp__fieldsdk__get_selection',
        'mcp__fieldsdk__get_component_source',
        'Read',
        'Edit',
      ],
      stderr: (d) => process.stderr.write(`[cli] ${d}`),
    },
  });

  // Fire the first prompt immediately: in streaming-input mode the CLI may
  // withhold the system/init message until it has received a user message.
  q.push(PROMPTS[0]);
  sentCount = 1;

  let lastAssistantText = '';
  const toolCalls: string[] = [];

  for await (const msg of stream as AsyncGenerator<SDKMessage>) {
    if (msg.type === 'system' && msg.subtype === 'init') {
      sessionId = msg.session_id;
      console.log(`[init] session_id=${sessionId} model=${msg.model} apiKeySource=${msg.apiKeySource}`);
      console.log(`[init] mcp_servers=${JSON.stringify(msg.mcp_servers)}`);
      if (!accountLogged) {
        accountLogged = true;
        try {
          const acc = await stream.accountInfo();
          console.log(
            `[account] apiProvider=${acc.apiProvider} tokenSource=${acc.tokenSource} apiKeySource=${acc.apiKeySource} hasEmail=${Boolean(acc.email)} hasOrg=${Boolean(acc.organization)} subscriptionType=${acc.subscriptionType}`,
          );
        } catch (e) {
          console.log(`[account] accountInfo() failed: ${(e as Error).message}`);
        }
      }
    } else if (msg.type === 'assistant') {
      for (const block of msg.message.content) {
        if (block.type === 'text') lastAssistantText = block.text.trim();
        if (block.type === 'tool_use') toolCalls.push(block.name);
      }
    } else if (msg.type === 'result') {
      const u = msg.usage as Record<string, number>;
      const row: UsageRow = {
        session: 's1',
        turn: sentCount,
        prompt: PROMPTS[sentCount - 1],
        input_tokens: u.input_tokens ?? 0,
        cache_creation_input_tokens: u.cache_creation_input_tokens ?? 0,
        cache_read_input_tokens: u.cache_read_input_tokens ?? 0,
        output_tokens: u.output_tokens ?? 0,
        total_cost_usd: (msg as { total_cost_usd: number }).total_cost_usd ?? 0,
        num_turns: (msg as { num_turns: number }).num_turns ?? 0,
        answer: lastAssistantText,
      };
      rows.push(row);
      console.log(
        `[result s1.${row.turn}] in=${row.input_tokens} cc=${row.cache_creation_input_tokens} cr=${row.cache_read_input_tokens} out=${row.output_tokens} cost=${row.total_cost_usd} turns=${row.num_turns} :: "${row.answer}"`,
      );
      lastAssistantText = '';

      if (sentCount < PROMPTS.length) {
        q.push(PROMPTS[sentCount]);
        sentCount += 1;
      } else {
        q.close();
      }
    }
  }

  console.log(`[tools called] ${JSON.stringify(toolCalls)}`);
  console.log('\n' + markdownTable(rows));

  writeFileSync(join(HERE, '.session-id'), sessionId, 'utf8');
  writeFileSync(
    join(HERE, 'usage-log.json'),
    JSON.stringify({ sessionId, toolCalls, rows }, null, 2),
    'utf8',
  );
  console.log(`\n[saved] .session-id=${sessionId}`);
}

main().catch((e) => {
  console.error('SESSION1 ERROR:', e);
  process.exit(1);
});
