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
  it('insert/get by traceId', () => {
    const store = new TraceStore();
    store.insert(trace);
    expect(store.get(trace.traceId)?.route).toBe('GET /api/orders');
    expect(store.get('nonexistent')).toBeNull();
  });

  it('expires entries past the TTL', () => {
    const store = new TraceStore(-1); // negative TTL → everything already expired
    store.insert(trace);
    expect(store.get(trace.traceId)).toBeNull();
  });
});

describe('resolveBackendTrace (get_backend_trace)', () => {
  const selection: SelectionPayload = {
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

  it('resolves by direct traceId and formats readably', () => {
    const store = new TraceStore();
    store.insert(trace);
    const out = resolveBackendTrace(new InstrumentationCache(), store, { traceId: trace.traceId });
    expect(out).toContain('Route: GET /api/orders');
    expect(out).toContain('Handler: listOrders (src/orders/route.ts:8)');
    expect(out).toContain('[postgresql] SELECT * FROM orders WHERE id = ? @ src/orders/repo.ts:20 — 12ms');
  });

  it('resolves the traceId from the selected component', () => {
    const store = new TraceStore();
    store.insert(trace);
    const cache = new InstrumentationCache();
    cache.setSelection(selection);
    const out = resolveBackendTrace(cache, store, { selectionId: 's1' });
    expect(out).toContain('Route: GET /api/orders');
  });

  it('clear message when there is no trace for the id', () => {
    const out = resolveBackendTrace(new InstrumentationCache(), new TraceStore(), {
      traceId: 'b'.repeat(32),
    });
    expect(out).toContain('No backend trace');
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
    appVersion: 'test',
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

  it('204 and stores a valid BackendTrace', async () => {
    expect(await post(JSON.stringify(trace))).toBe(204);
    expect(store.get(trace.traceId)?.route).toBe('GET /api/orders');
  });

  it('400 for invalid JSON', async () => {
    expect(await post('{ not json')).toBe(400);
  });

  it('400 for a body that does not match the BackendTrace schema', async () => {
    expect(await post(JSON.stringify({ foo: 1 }))).toBe(400);
  });

  it('403 for a non-loopback Host (DNS rebinding protection)', async () => {
    // fetch won't let us override Host easily; use a raw socket.
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
