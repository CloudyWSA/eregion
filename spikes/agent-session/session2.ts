// Spike session 2: resume the session persisted by session1.ts in a FRESH
// process, send 2 more messages whose answers depend on earlier context.

import { query } from '@anthropic-ai/claude-agent-sdk';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
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

const idPath = join(HERE, '.session-id');
if (!existsSync(idPath)) {
  console.error('ABORT: .session-id not found. Run session1.ts first.');
  process.exit(1);
}
const sessionId = readFileSync(idPath, 'utf8').trim();

const PROMPTS = [
  'Without using any tools: what component did we discuss earlier? One word.',
  'And what was its exact file path? One line.',
];

async function main() {
  console.log(`[resume] resuming session_id=${sessionId}`);
  const q = createMessageQueue();
  const rows: UsageRow[] = [];
  let sentCount = 0;

  const stream = query({
    prompt: q.iterable,
    options: {
      cwd: HERE,
      resume: sessionId,
      systemPrompt: {
        type: 'preset',
        preset: 'claude_code',
        append: 'You are a spike test agent. Keep every answer under 20 words.',
      },
      permissionMode: 'acceptEdits',
      includePartialMessages: false,
      model: 'haiku',
      maxTurns: 6,
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

  // Same as session1: push first prompt before consuming, or init never comes.
  q.push(PROMPTS[0]);
  sentCount = 1;

  let lastAssistantText = '';
  let resumedSessionId = sessionId;

  for await (const msg of stream as AsyncGenerator<SDKMessage>) {
    if (msg.type === 'system' && msg.subtype === 'init') {
      resumedSessionId = msg.session_id;
      console.log(`[init] resumed session_id=${msg.session_id} (requested ${sessionId})`);
    } else if (msg.type === 'assistant') {
      for (const block of msg.message.content) {
        if (block.type === 'text') lastAssistantText = block.text.trim();
      }
    } else if (msg.type === 'result') {
      const u = msg.usage as Record<string, number>;
      const row: UsageRow = {
        session: 's2',
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
        `[result s2.${row.turn}] in=${row.input_tokens} cc=${row.cache_creation_input_tokens} cr=${row.cache_read_input_tokens} out=${row.output_tokens} cost=${row.total_cost_usd} turns=${row.num_turns} :: "${row.answer}"`,
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

  console.log(`\n[resume] same session id kept? ${resumedSessionId === sessionId}`);
  console.log('\n' + markdownTable(rows));

  writeFileSync(
    join(HERE, 'usage-log-s2.json'),
    JSON.stringify({ sessionId, resumedSessionId, rows }, null, 2),
    'utf8',
  );
}

main().catch((e) => {
  console.error('SESSION2 ERROR:', e);
  process.exit(1);
});
