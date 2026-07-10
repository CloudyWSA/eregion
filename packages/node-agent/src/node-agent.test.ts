import { SpanKind, type Attributes } from '@opentelemetry/api';
import type { ReadableSpan, Span } from '@opentelemetry/sdk-trace-base';
import type { BackendTrace } from '@eregion/protocol';
import { describe, expect, it } from 'vitest';
import { firstAppFrame, parseStackFrame, sanitizeStatement } from './sanitize.js';
import { EregionSpanProcessor, type TraceSink } from './span-processor.js';

const REPO = '/repo/app';

/** Span mínimo suficiente para o processor (só o que ele lê). */
function fakeSpan(opts: {
  traceId: string;
  spanId?: string;
  kind: SpanKind;
  attributes: Attributes;
  durationMs?: number;
}): ReadableSpan & Span {
  const ms = opts.durationMs ?? 0;
  return {
    kind: opts.kind,
    attributes: opts.attributes,
    duration: [Math.floor(ms / 1000), (ms % 1000) * 1e6],
    spanContext: () => ({ traceId: opts.traceId, spanId: opts.spanId ?? 'span-1', traceFlags: 1 }),
  } as unknown as ReadableSpan & Span;
}

function collector(): { sink: TraceSink; traces: BackendTrace[] } {
  const traces: BackendTrace[] = [];
  return { sink: { send: (t) => traces.push(t) }, traces };
}

describe('sanitizeStatement', () => {
  it('remove literais string e numéricos e colapsa espaço', () => {
    const stmt = "SELECT *  FROM   orders WHERE id = 42 AND name = 'Ana O''Brien'";
    expect(sanitizeStatement(stmt)).toBe('SELECT * FROM orders WHERE id = ? AND name = ?');
  });

  it('trunca statements muito longos', () => {
    const long = `SELECT ${'a'.repeat(1000)}`;
    const out = sanitizeStatement(long);
    expect(out.length).toBeLessThanOrEqual(501);
    expect(out.endsWith('…')).toBe(true);
  });
});

describe('parseStackFrame / firstAppFrame', () => {
  it('parseia frame com função e parênteses', () => {
    expect(parseStackFrame('    at Object.load (/repo/app/src/db.ts:12:7)')).toEqual({
      file: '/repo/app/src/db.ts',
      line: 12,
      column: 7,
    });
  });

  it('parseia frame sem função (só localização)', () => {
    expect(parseStackFrame('    at /repo/app/src/db.ts:3:1')).toEqual({
      file: '/repo/app/src/db.ts',
      line: 3,
      column: 1,
    });
  });

  it('normaliza URLs file:// do ESM', () => {
    expect(parseStackFrame('    at fn (file:///repo/app/src/x.ts:5:9)')).toEqual({
      file: '/repo/app/src/x.ts',
      line: 5,
      column: 9,
    });
  });

  it('firstAppFrame pula node_modules e retorna path relativo ao repo', () => {
    const stack = [
      'Error',
      '    at query (/repo/app/node_modules/pg/lib/client.js:1:1)',
      '    at getOrders (/repo/app/src/orders/repo.ts:20:5)',
      '    at handler (/repo/app/src/orders/route.ts:8:3)',
    ].join('\n');
    expect(firstAppFrame(stack, REPO)).toEqual({
      file: 'src/orders/repo.ts',
      line: 20,
      column: 5,
    });
  });

  it('firstAppFrame retorna undefined quando tudo está fora do repo', () => {
    const stack = 'Error\n    at q (/other/place/x.js:1:1)';
    expect(firstAppFrame(stack, REPO)).toBeUndefined();
  });
});

describe('EregionSpanProcessor', () => {
  it('monta BackendTrace no fim do span de servidor com queries e rota', () => {
    const { sink, traces } = collector();
    const proc = new EregionSpanProcessor(REPO, sink);
    const traceId = 'abc123';

    const db = fakeSpan({
      traceId,
      spanId: 'db-1',
      kind: SpanKind.CLIENT,
      attributes: { 'db.system': 'postgresql', 'db.statement': 'SELECT * FROM orders WHERE id = 7' },
      durationMs: 12,
    });
    proc.onStart(db);
    proc.onEnd(db);

    const handler = fakeSpan({
      traceId,
      kind: SpanKind.INTERNAL,
      attributes: { 'express.type': 'request_handler', 'express.name': 'listOrders' },
    });
    proc.onEnd(handler);

    const server = fakeSpan({
      traceId,
      kind: SpanKind.SERVER,
      attributes: { 'http.method': 'GET', 'http.route': '/api/orders' },
      durationMs: 30,
    });
    proc.onEnd(server);

    expect(traces).toHaveLength(1);
    expect(traces[0]).toMatchObject({
      traceId: 'abc123',
      route: 'GET /api/orders',
      handler: { name: 'listOrders' },
      durationMs: 30,
    });
    expect(traces[0].queries).toHaveLength(1);
    expect(traces[0].queries[0]).toMatchObject({ db: 'postgresql', stmt: 'SELECT * FROM orders WHERE id = ?', ms: 12 });
  });

  it('deriva rota do pathname quando http.url é absoluta e sem http.route', () => {
    const { sink, traces } = collector();
    const proc = new EregionSpanProcessor(REPO, sink);
    proc.onEnd(
      fakeSpan({
        traceId: 't2',
        kind: SpanKind.SERVER,
        attributes: { 'http.method': 'POST', 'http.url': 'http://localhost:3000/api/save?x=1' },
      }),
    );
    expect(traces[0].route).toBe('POST /api/save');
  });

  it('capture.statements=false omite o statement', () => {
    const { sink, traces } = collector();
    const proc = new EregionSpanProcessor(REPO, sink, { statements: false });
    const db = fakeSpan({
      traceId: 't3',
      spanId: 'db-x',
      kind: SpanKind.CLIENT,
      attributes: { 'db.system': 'mysql', 'db.statement': 'SELECT 1' },
    });
    proc.onStart(db);
    proc.onEnd(db);
    proc.onEnd(fakeSpan({ traceId: 't3', kind: SpanKind.SERVER, attributes: {} }));
    expect(traces[0].queries[0].stmt).toBe('');
    expect(traces[0].queries[0].db).toBe('mysql');
  });
});
