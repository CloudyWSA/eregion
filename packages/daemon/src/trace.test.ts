import { once } from 'node:events';
import { PROTOCOL_VERSION, type BackendTrace, type SelectionPayload } from '@eregion/protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RuntimePool } from './runtime-pool.js';
import { InstrumentationCache } from './instrumentation-cache.js';
import { resolveBackendTrace } from './mcp-tools.js';
import { PermissionBroker } from './permission-broker.js';
import { DaemonServer } from './server.js';
import { TraceStore } from './trace-store.js';

const trace: BackendTrace = {
  traceId: 'a'.repeat(32),
  route: 'GET /api/orders',
  handler: { name: 'listOrders', src: { file: 'src/orders/route.ts', line: 8 } },
  queries: [
    { db: 'postgresql', stmt: 'SELECT * FROM orders WHERE id = ?', src: { file: 'src/orders/repo.ts', line: 20 }, ms: 12 },
  ],
  durationMs: 30,
};

describe('TraceStore', () => {
  it('insert/get por traceId', () => {
    const store = new TraceStore();
    store.insert(trace);
    expect(store.get(trace.traceId)?.route).toBe('GET /api/orders');
    expect(store.get('inexistente')).toBeNull();
  });

  it('expira entradas além do TTL', () => {
    const store = new TraceStore(-1); // TTL negativo → tudo já expirado
    store.insert(trace);
    expect(store.get(trace.traceId)).toBeNull();
  });
});

describe('resolveBackendTrace (get_backend_trace)', () => {
  const selecao: SelectionPayload = {
    v: PROTOCOL_VERSION,
    app: { framework: 'react', name: 'app', route: '/' },
    selection: [
      {
        id: 's1',
        name: 'OrderList',
        framework: 'react',
        dom: { tag: 'ul', rect: [0, 0, 10, 10] },
        http: [{ req: 'GET /api/orders → 200 (30ms)', traceId: 'a'.repeat(32) }],
      },
    ],
  };

  it('resolve por traceId direto e formata legível', () => {
    const store = new TraceStore();
    store.insert(trace);
    const out = resolveBackendTrace(new InstrumentationCache(), store, { traceId: trace.traceId });
    expect(out).toContain('Rota: GET /api/orders');
    expect(out).toContain('Handler: listOrders (src/orders/route.ts:8)');
    expect(out).toContain('[postgresql] SELECT * FROM orders WHERE id = ? @ src/orders/repo.ts:20 — 12ms');
  });

  it('resolve o traceId a partir do componente selecionado', () => {
    const store = new TraceStore();
    store.insert(trace);
    const cache = new InstrumentationCache();
    cache.setSelection(selecao);
    const out = resolveBackendTrace(cache, store, { selectionId: 's1' });
    expect(out).toContain('Rota: GET /api/orders');
  });

  it('mensagem clara quando não há trace para o id', () => {
    const out = resolveBackendTrace(new InstrumentationCache(), new TraceStore(), {
      traceId: 'b'.repeat(32),
    });
    expect(out).toContain('Nenhum trace de backend');
  });
});

describe('POST /trace/ingest', () => {
  const cache = new InstrumentationCache();
  const store = new TraceStore();
  const poolStub = { primarySessionId: null } as unknown as RuntimePool;
  const broker = new PermissionBroker(['/repo'], () => undefined);
  const server = new DaemonServer({
    token: 'tok',
    repoRoot: '/repo',
    appVersion: 'teste',
    cache,
    broker,
    pool: poolStub,
    traceStore: store,
  });
  let port = 0;

  beforeAll(async () => {
    port = 47191;
    await server.listen(port);
  });
  afterAll(async () => {
    await server.close();
  });

  async function post(body: string, host = '127.0.0.1'): Promise<number> {
    const res = await fetch(`http://127.0.0.1:${port}/trace/ingest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', host },
      body,
    });
    return res.status;
  }

  it('204 e armazena um BackendTrace válido', async () => {
    expect(await post(JSON.stringify(trace))).toBe(204);
    expect(store.get(trace.traceId)?.route).toBe('GET /api/orders');
  });

  it('400 para JSON inválido', async () => {
    expect(await post('{ nao json')).toBe(400);
  });

  it('400 para body que não bate no schema BackendTrace', async () => {
    expect(await post(JSON.stringify({ foo: 1 }))).toBe(400);
  });

  it('403 para Host não-loopback (proteção DNS rebinding)', async () => {
    // fetch não deixa sobrescrever Host facilmente; usa socket cru.
    const { connect } = await import('node:net');
    const sock = connect(port, '127.0.0.1');
    await once(sock, 'connect');
    sock.write(
      'POST /trace/ingest HTTP/1.1\r\nHost: evil.example\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}',
    );
    const [chunk] = (await once(sock, 'data')) as [Buffer];
    sock.destroy();
    expect(chunk.toString('utf8')).toContain('403');
  });
});
