import { describe, expect, it } from 'vitest';
import {
  makeEnvelope,
  parseClientMessage,
  parseDaemonMessage,
  PROTOCOL_VERSION,
  SelectedComponent,
  SelectionPayload,
} from './index.js';

const exampleComponent = {
  id: 's1',
  name: 'OrderListComponent',
  framework: 'angular' as const,
  src: { file: 'src/app/orders/order-list/order-list.component.ts', line: 18 },
  tpl: { file: 'src/app/orders/order-list/order-list.component.html', line: 34, column: 5 },
  dom: { tag: 'app-order-list', rect: [120, 300, 800, 400] as [number, number, number, number], text: 'Recent orders' },
  props: { status: "'open'", customer: "{id:'c_9f2', name:'ACME', …+6}" },
  state: { orders: 'Signal<Order[]>(len=12)', loading: 'false' },
  deps: ['OrderService → src/app/orders/order.service.ts'],
  children: ['OrderRowComponent ×12 → src/app/orders/order-row/order-row.component.ts:9'],
  http: [
    {
      req: 'GET /api/orders?status=open → 200 (142ms)',
      traceId: 't_4a1b',
      origin: { file: 'src/app/orders/order.service.ts', line: 41 },
    },
  ],
  refs: { fullProps: 's1.props', fullState: 's1.state', domHtml: 's1.dom', 'trace:t_4a1b': 't_4a1b' },
};

const examplePayload = {
  v: PROTOCOL_VERSION,
  app: { framework: 'angular@20', name: 'example-app', route: '/orders/123' },
  selection: [exampleComponent, { ...exampleComponent, id: 's2', name: 'OrderRowComponent' }],
};

describe('SelectionPayload', () => {
  it('validates a realistic payload with 2 components', () => {
    expect(SelectionPayload.parse(examplePayload)).toBeTruthy();
  });

  it('rejects a 0-based line (must be 1-based)', () => {
    const bad = { ...exampleComponent, src: { file: 'a.ts', line: 0 } };
    expect(SelectedComponent.safeParse(bad).success).toBe(false);
  });

  it('rejects an unknown protocol version', () => {
    expect(SelectionPayload.safeParse({ ...examplePayload, v: 2 }).success).toBe(false);
  });

  it('a typical serialized component fits the budget (< 2800 chars ≈ 700 tokens)', () => {
    expect(JSON.stringify(exampleComponent).length).toBeLessThan(2800);
  });
});

describe('WS messages — round-trip', () => {
  const clientCases = [
    { type: 'hello', payload: { token: 'tok_abc' } },
    { type: 'selection.update', payload: { payload: examplePayload } },
    { type: 'chat.send', payload: { text: 'standardize these buttons', attachSelection: true } },
    { type: 'chat.cancel', payload: {} },
    { type: 'permission.respond', payload: { requestId: 'r1', allow: true, remember: true } },
    { type: 'mode.set', payload: { mode: 'review' } },
    { type: 'changes.revert', payload: { checkpointId: 'ckpt_9' } },
  ] as const;

  it.each(clientCases.map((m) => [m.type, m] as const))('client: %s', (_type, msg) => {
    const env = makeEnvelope('id-1', msg as never);
    const res = parseClientMessage(JSON.parse(JSON.stringify(env)));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.msg.type).toBe(msg.type);
      expect(res.msg.id).toBe('id-1');
    }
  });

  const daemonCases = [
    { type: 'hello.ok', payload: { sessionId: null, model: 'sonnet', cwd: '/repo' } },
    { type: 'hello.error', payload: { code: 'bad_token', message: 'invalid token' } },
    { type: 'chat.delta', payload: { text: 'Applying the pattern…' } },
    { type: 'chat.tool', payload: { name: 'mcp__eregion__get_selection', label: '🔍 selection', status: 'done' } },
    {
      type: 'chat.result',
      payload: { usage: { inputTokens: 12, outputTokens: 340, cacheReadTokens: 28670, costUsd: 0.01 }, durationMs: 4200 },
    },
    { type: 'edit.applied', payload: { file: 'src/Button.tsx', diff: '- a\n+ b', checkpointId: 'ckpt_9' } },
    { type: 'permission.request', payload: { requestId: 'r1', toolName: 'Bash', summary: 'git push origin main' } },
    { type: 'status', payload: { state: 'thinking' } },
    { type: 'error', payload: { code: 'rate_limit', message: 'rate window exhausted', retryAfterMs: 60000 } },
  ] as const;

  it.each(daemonCases.map((m) => [m.type, m] as const))('daemon: %s', (_type, msg) => {
    const env = makeEnvelope('id-2', msg as never);
    const res = parseDaemonMessage(JSON.parse(JSON.stringify(env)));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.msg.type).toBe(msg.type);
  });
});

describe('WS messages — rejection', () => {
  it('rejects an unknown type', () => {
    const res = parseClientMessage({ v: 1, id: 'x', type: 'chat.explode', payload: {} });
    expect(res.ok).toBe(false);
  });

  it('rejects a payload with a wrong field and points at the path', () => {
    const res = parseClientMessage({ v: 1, id: 'x', type: 'chat.send', payload: { text: 42, attachSelection: true } });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('chat.send');
  });

  it('rejects an envelope without v', () => {
    const res = parseDaemonMessage({ id: 'x', type: 'status', payload: { state: 'idle' } });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('envelope');
  });

  it('does not throw on arbitrary input', () => {
    for (const junk of [null, undefined, 42, 'hi', [], { v: 99 }]) {
      expect(() => parseClientMessage(junk)).not.toThrow();
    }
  });
});
