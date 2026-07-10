import { SpanKind, type Attributes } from '@opentelemetry/api';
import { hrTimeToMilliseconds } from '@opentelemetry/core';
import type { ReadableSpan, Span, SpanProcessor } from '@opentelemetry/sdk-trace-base';
import type { BackendTrace, DbQuery } from '@eregion/protocol';
import { firstAppFrame, sanitizeStatement } from './sanitize.js';

/** Controla o que o agente extrai de cada trace. */
export interface CaptureOptions {
  /** Incluir db.statement sanitizado (default true). */
  statements?: boolean;
  /** Resolver call site (SourceRef) via stack (default true). */
  stack?: boolean;
}

/** Destino do trace montado — abstraído para testar sem daemon. */
export interface TraceSink {
  send(trace: BackendTrace): void;
}

interface TraceBuilder {
  queries: DbQuery[];
  handlerName?: string;
}

function isDbSpan(attrs: Attributes): boolean {
  return attrs['db.system'] != null;
}

/** "GET /api/orders" a partir dos atributos semconv do span de servidor. */
function buildRoute(attrs: Attributes): string | undefined {
  const method = typeof attrs['http.method'] === 'string' ? (attrs['http.method'] as string) : '';
  const route = attrs['http.route'] ?? attrs['http.target'] ?? attrs['http.url'];
  let target = typeof route === 'string' ? route : '';
  // http.url é absoluta — fica só com o pathname.
  if (target.includes('://')) {
    try {
      target = new URL(target).pathname;
    } catch {
      // mantém como veio
    }
  }
  const joined = `${method} ${target}`.trim();
  return joined.length > 0 ? joined : undefined;
}

/**
 * SpanProcessor custom do Eregion:
 *  - em span de DB: no onStart captura o stack (call site vivo), no onEnd lê
 *    db.system/db.statement (sanitizado) e monta um DbQuery com SourceRef;
 *  - em span de request_handler (express): guarda o nome do handler;
 *  - no fim do span de servidor (raiz da request neste processo): monta o
 *    BackendTrace com traceId (do traceparent recebido), rota, handler,
 *    queries e duração, e envia ao sink.
 */
export class EregionSpanProcessor implements SpanProcessor {
  private traces = new Map<string, TraceBuilder>();
  private stacks = new Map<string, string | undefined>();

  constructor(
    private repoRoot: string,
    private sink: TraceSink,
    private capture: CaptureOptions = {},
  ) {}

  onStart(span: Span): void {
    if (this.capture.stack !== false && isDbSpan(span.attributes)) {
      // O stack no início do span de DB ainda contém os frames do app.
      this.stacks.set(span.spanContext().spanId, new Error().stack);
    }
  }

  onEnd(span: ReadableSpan): void {
    const attrs = span.attributes;
    const traceId = span.spanContext().traceId;

    if (isDbSpan(attrs)) {
      this.onDbEnd(span, traceId);
      return;
    }
    if (attrs['express.type'] === 'request_handler') {
      const name = attrs['express.name'];
      if (typeof name === 'string') this.builder(traceId).handlerName = name;
      return;
    }
    if (span.kind === SpanKind.SERVER) {
      this.flushTrace(span, traceId);
    }
  }

  forceFlush(): Promise<void> {
    return Promise.resolve();
  }

  shutdown(): Promise<void> {
    this.traces.clear();
    this.stacks.clear();
    return Promise.resolve();
  }

  private builder(traceId: string): TraceBuilder {
    let b = this.traces.get(traceId);
    if (!b) {
      b = { queries: [] };
      this.traces.set(traceId, b);
    }
    return b;
  }

  private onDbEnd(span: ReadableSpan, traceId: string): void {
    const attrs = span.attributes;
    const spanId = span.spanContext().spanId;
    const stack = this.stacks.get(spanId);
    this.stacks.delete(spanId);

    const rawStmt = attrs['db.statement'];
    const query: DbQuery = {
      db: typeof attrs['db.system'] === 'string' ? (attrs['db.system'] as string) : 'unknown',
      stmt:
        this.capture.statements !== false && typeof rawStmt === 'string'
          ? sanitizeStatement(rawStmt)
          : '',
      ms: hrTimeToMilliseconds(span.duration),
    };
    const src = firstAppFrame(stack, this.repoRoot);
    if (src) query.src = src;
    this.builder(traceId).queries.push(query);
  }

  private flushTrace(span: ReadableSpan, traceId: string): void {
    const b = this.traces.get(traceId);
    this.traces.delete(traceId);

    const trace: BackendTrace = {
      traceId,
      queries: b?.queries ?? [],
      durationMs: hrTimeToMilliseconds(span.duration),
    };
    const route = buildRoute(span.attributes);
    if (route) trace.route = route;
    if (b?.handlerName) trace.handler = { name: b.handlerName };

    this.sink.send(trace);
  }
}
