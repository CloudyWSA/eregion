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

const selecao: SelectionPayload = {
  v: PROTOCOL_VERSION,
  app: { framework: 'react', name: 'app-teste', route: '/' },
  selection: [
    {
      id: 's1',
      name: 'PrimaryButton',
      framework: 'react',
      tpl: { file: 'src/components/PrimaryButton.tsx', line: 9, column: 3 },
      dom: { tag: 'button', rect: [0, 0, 100, 32], text: 'Salvar' },
      http: [{ req: 'POST /api/save → 200 (80ms)' }],
    },
  ],
};

describe('InstrumentationCache', () => {
  it('compactRefs resume a seleção em uma linha por componente', () => {
    const cache = new InstrumentationCache();
    cache.setSelection(selecao);
    expect(cache.compactRefs()).toEqual([
      '<selecionado s1: PrimaryButton — src/components/PrimaryButton.tsx:9, 1 request(s)>',
    ]);
  });
});

describe('PermissionBroker', () => {
  const workspace = '/repo/app';

  it('modo auto permite edição dentro do workspace sem perguntar', async () => {
    const broker = new PermissionBroker([workspace], () => {
      throw new Error('não deveria perguntar');
    });
    const result = await broker.canUseTool(
      'Edit',
      { file_path: `${workspace}/src/a.tsx`, old_string: 'a', new_string: 'b' },
      { signal: new AbortController().signal, suggestions: [], toolUseID: 'tu1', requestId: 'req1' },
    );
    expect(result?.behavior).toBe('allow');
  });

  it('Bash sempre pergunta; respond(false) nega', async () => {
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

  it('modo review pergunta até para edição no workspace', async () => {
    const broker = new PermissionBroker([workspace], (req) => broker.respond(req.requestId, true));
    broker.mode = 'review';
    const result = await broker.canUseTool(
      'Edit',
      { file_path: `${workspace}/src/a.tsx` },
      { signal: new AbortController().signal, suggestions: [], toolUseID: 'tu1', requestId: 'req1' },
    );
    expect(result?.behavior).toBe('allow');
  });
});

describe('DaemonServer', () => {
  const TOKEN = 'token-de-teste';
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
    appVersion: 'teste',
    cache,
    broker,
    pool: poolStub,
    traceStore: new TraceStore(),
  });
  let port = 0;

  beforeAll(async () => {
    // porta efêmera do range do daemon para não colidir com nada em uso
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

  it('token errado → hello.error e desconexão', async () => {
    const ws = await connect();
    const reply = nextMessage(ws);
    sendMsg(ws, { type: 'hello', payload: { token: 'errado' } });
    expect(await reply).toMatchObject({ type: 'hello.error', payload: { code: 'bad_token' } });
    await once(ws, 'close');
  });

  it('handshake válido → hello.ok; selection.update alimenta o cache; chat.send anexa refs', async () => {
    const ws = await connect();
    const hello = nextMessage(ws);
    sendMsg(ws, { type: 'hello', payload: { token: TOKEN } });
    expect(await hello).toMatchObject({ type: 'hello.ok', payload: { cwd: '/repo' } });

    sendMsg(ws, { type: 'selection.update', payload: { payload: selecao } });
    sendMsg(ws, { type: 'chat.send', payload: { text: 'deixa esse botão verde', attachSelection: true } });

    await new Promise((r) => setTimeout(r, 100));
    expect(cache.getComponent('s1')?.name).toBe('PrimaryButton');
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain('<selecionado s1: PrimaryButton');
    expect(sent[0]).toContain('deixa esse botão verde');
    ws.close();
  });

  it('mensagem antes do hello → conexão fechada', async () => {
    const ws = await connect();
    sendMsg(ws, { type: 'chat.cancel', payload: {} });
    await once(ws, 'close');
    expect(ws.readyState).toBe(WebSocket.CLOSED);
  });
});
