// Probe: maxTurns semantics. The session on disk already accumulated 12 turns
// (10 in session1 + 2 in session2). Resume it with maxTurns: 10 and send ONE
// short message:
//   - success result       -> maxTurns does NOT count resumed history
//                              (it is a per-query() budget)
//   - error_max_turns      -> maxTurns is cumulative over the session lifetime

import { query } from '@anthropic-ai/claude-agent-sdk';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fieldsdkServer, createMessageQueue } from './shared.js';

const HERE = new URL('.', import.meta.url).pathname;

if (process.env.ANTHROPIC_API_KEY) {
  console.error('ABORT: ANTHROPIC_API_KEY is set; spike must use Claude Code login.');
  process.exit(1);
}

const sessionId = readFileSync(join(HERE, '.session-id'), 'utf8').trim();

async function main() {
  console.log(`[probe] resuming session_id=${sessionId} (history: 12 turns) with maxTurns: 10`);
  const q = createMessageQueue();

  const stream = query({
    prompt: q.iterable,
    options: {
      cwd: HERE,
      resume: sessionId,
      systemPrompt: { type: 'preset', preset: 'claude_code', append: 'Answer in under 10 words.' },
      permissionMode: 'acceptEdits',
      includePartialMessages: false,
      model: 'haiku',
      maxTurns: 10,
      mcpServers: { fieldsdk: fieldsdkServer },
      allowedTools: ['mcp__fieldsdk__get_selection', 'mcp__fieldsdk__get_component_source'],
    },
  });

  q.push('Responda somente: ok');

  let answer = '';
  for await (const msg of stream as AsyncGenerator<SDKMessage>) {
    if (msg.type === 'assistant') {
      for (const block of msg.message.content) {
        if (block.type === 'text') answer = block.text.trim();
      }
    } else if (msg.type === 'result') {
      const u = msg.usage as Record<string, number>;
      const out = {
        subtype: msg.subtype,
        is_error: msg.is_error,
        num_turns: msg.num_turns,
        input_tokens: u.input_tokens ?? 0,
        cache_creation_input_tokens: u.cache_creation_input_tokens ?? 0,
        cache_read_input_tokens: u.cache_read_input_tokens ?? 0,
        output_tokens: u.output_tokens ?? 0,
        total_cost_usd: msg.total_cost_usd,
        errors: 'errors' in msg ? (msg as { errors: string[] }).errors : undefined,
        answer,
      };
      console.log('[probe result]', JSON.stringify(out, null, 2));
      writeFileSync(join(HERE, 'usage-log-probe.json'), JSON.stringify({ sessionId, ...out }, null, 2), 'utf8');
      const verdict =
        msg.subtype === 'success'
          ? 'VERDICT: maxTurns is a PER-QUERY budget (resumed history not counted)'
          : `VERDICT: maxTurns appears CUMULATIVE (got ${msg.subtype})`;
      console.log(verdict);
      q.close();
    }
  }
}

main().catch((e) => {
  console.error('PROBE ERROR:', e);
  process.exit(1);
});
