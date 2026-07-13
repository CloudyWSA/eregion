import { once } from 'node:events';
import {
  makeEnvelope,
  parseDaemonMessage,
  PROTOCOL_VERSION,
  type ClientMessage,
  type DaemonMessage,
  type SelectionPayload,
} from '@eregion/protocol';
import { WebSocket } from 'ws';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RuntimePool } from './runtime-pool.js';
import { InstrumentationCache } from './instrumentation-cache.js';
import { PermissionBroker } from './permission-broker.js';
import { DaemonServer } from './server.js';
import { TraceStore } from './trace-store.js';

const selection: SelectionPayload = {
  v: PROTOCOL_VERSION,
  app: { framework: 'react', name: 'test-app', route: '/' },
  selection: [
    {
      id: 's1',
      name: 'PrimaryButton',
      framework: 'react',
      tpl: { file: 'src/components/PrimaryButton.tsx', line: 9, column: 3 },
      dom: { tag: 'button', rect: [0, 0, 100, 32], text: 'Save' },
      http: [{ req: 'POST /api/save → 200 (80ms)' }],
    },
  ],
};

describe('InstrumentationCache', () => {
  it('compactRefs summarizes the selection in one line per component', () => {
    const cache = new InstrumentationCache();
    cache.setSelection(selection);
    expect(cache.compactRefs()).toEqual([
      '<selected s1: PrimaryButton — src/components/PrimaryButton.tsx:9, 1 request(s)>',
    ]);
  });
});

describe('PermissionBroker', () => {
  const workspace = '/repo/app';

  it('auto mode allows edits inside the workspace without asking', async () => {
    const broker = new PermissionBroker([workspace], () => {
      throw new Error('should not ask');
    });
    const result = await broker.canUseTool(
      'Edit',
      { file_path: `${workspace}/src/a.tsx`, old_string: 'a', new_string: 'b' },
      { signal: new AbortController().signal, suggestions: [], toolUseID: 'tu1', requestId: 'req1' },
    );
    expect(result?.behavior).toBe('allow');
  });

  it('Bash always asks; respond(false) denies', async () => {
    const asked: string[] = [];
    const broker = new PermissionBroker([workspace], (req) => {
      asked.push(req.summary);
      broker.respond(req.requestId, false);
    });
    const result = await broker.canUseTool(
      'Bash',
      { command: 'rm -rf /' },
      { signal: new AbortController().signal, suggestions: [], toolUseID: 'tu1', requestId: 'req1' },
    );
    expect(asked).toEqual(['rm -rf /']);
    expect(result?.behavior).toBe('deny');
  });

  it('review mode asks even for a workspace edit', async () => {
    const broker = new PermissionBroker([workspace], (req) => broker.respond(req.requestId, true));
    broker.mode = 'review';
    const result = await broker.canUseTool(
      'Edit',
      { file_path: `${workspace}/src/a.tsx` },
      { signal: new AbortController().signal, suggestions: [], toolUseID: 'tu1', requestId: 'req1' },
    );
    expect(result?.behavior).toBe('allow');
  });

  it('yolo mode auto-approves Bash without asking', async () => {
    const broker = new PermissionBroker([workspace], () => {
      throw new Error('should not ask');
    });
    broker.mode = 'yolo';
    const result = await broker.canUseTool(
      'Bash',
      { command: 'npm test' },
      { signal: new AbortController().signal, suggestions: [], toolUseID: 'tu1', requestId: 'req1' },
    );
    expect(result?.behavior).toBe('allow');
  });
});

describe('DaemonServer', () => {
  const TOKEN = 'test-token';
  const sent: string[] = [];
  const cache = new InstrumentationCache();
  const poolStub = {
    primarySessionId: null,
    dispatch(job: { jobId: string; text: string }) {
      sent.push(job.text);
    },
    cancel: async () => undefined,
    rewindFiles: async () => undefined,
  } as unknown as RuntimePool;
  const broker = new PermissionBroker(['/repo'], () => undefined);
  const server = new DaemonServer({
    token: TOKEN,
    repoRoot: '/repo',
    appVersion: 'test',
    cache,
    broker,
    pool: poolStub,
    traceStore: new TraceStore(),
    getSkills: () => [{ id: 'commit', name: 'commit', description: 'create a commit', argumentHint: '<message>' }],
  });
  let port = 0;

  beforeAll(async () => {
    // ephemeral port from the daemon range to avoid colliding with anything in use
    port = 47190;
    await server.listen(port);
  });
  afterAll(async () => {
    await server.close();
  });

  function connect(): Promise<WebSocket> {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    return once(ws, 'open').then(() => ws);
  }

  function sendMsg(ws: WebSocket, msg: ClientMessage): void {
    ws.send(JSON.stringify(makeEnvelope('t1', msg)));
  }

  function nextMessage(ws: WebSocket): Promise<DaemonMessage> {
    return new Promise((resolve, reject) => {
      ws.once('message', (data) => {
        const res = parseDaemonMessage(JSON.parse(String(data)));
        res.ok ? resolve(res.msg) : reject(new Error(res.error));
      });
    });
  }

  it('wrong token → hello.error and disconnect', async () => {
    const ws = await connect();
    const reply = nextMessage(ws);
    sendMsg(ws, { type: 'hello', payload: { token: 'wrong' } });
    expect(await reply).toMatchObject({ type: 'hello.error', payload: { code: 'bad_token' } });
    await once(ws, 'close');
  });

  it('valid handshake → hello.ok; selection.update feeds the cache; chat.send attaches refs', async () => {
    const ws = await connect();
    const hello = nextMessage(ws);
    sendMsg(ws, { type: 'hello', payload: { token: TOKEN } });
    expect(await hello).toMatchObject({
      type: 'hello.ok',
      payload: { cwd: '/repo', skills: [{ id: 'commit', name: 'commit' }] },
    });

    sendMsg(ws, { type: 'selection.update', payload: { payload: selection } });
    sendMsg(ws, { type: 'chat.send', payload: { text: 'make this button green', attachSelection: true } });

    await new Promise((r) => setTimeout(r, 100));
    expect(cache.getComponent('s1')?.name).toBe('PrimaryButton');
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain('<selected s1: PrimaryButton');
    expect(sent[0]).toContain('make this button green');
    ws.close();
  });

  it('message before hello → connection closed', async () => {
    const ws = await connect();
    sendMsg(ws, { type: 'chat.cancel', payload: {} });
    await once(ws, 'close');
    expect(ws.readyState).toBe(WebSocket.CLOSED);
  });
});
