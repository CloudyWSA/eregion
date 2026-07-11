import { SpanKind, type Attributes } from '@opentelemetry/api';
import { hrTimeToMilliseconds } from '@opentelemetry/core';
import type { ReadableSpan, Span, SpanProcessor } from '@opentelemetry/sdk-trace-base';
import type { BackendTrace, DbQuery } from '@eregion/protocol';
import { firstAppFrame, sanitizeStatement } from './sanitize.js';

/** Controls what the agent extracts from each trace. */
export interface CaptureOptions {
  /** Include the sanitized db.statement (default true). */
  statements?: boolean;
  /** Resolve the call site (SourceRef) via stack (default true). */
  stack?: boolean;
}

/** Destination of the built trace — abstracted to test without a daemon. */
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

/** "GET /api/orders" from the server span's semconv attributes. */
function buildRoute(attrs: Attributes): string | undefined {
  const method = typeof attrs['http.method'] === 'string' ? (attrs['http.method'] as string) : '';
  const route = attrs['http.route'] ?? attrs['http.target'] ?? attrs['http.url'];
  let target = typeof route === 'string' ? route : '';
  // http.url is absolute — keep only the pathname.
  if (target.includes('://')) {
    try {
      target = new URL(target).pathname;
    } catch {
      // keep as-is
    }
  }
  const joined = `${method} ${target}`.trim();
  return joined.length > 0 ? joined : undefined;
}

/**
 * Eregion's custom SpanProcessor:
 *  - DB span: onStart captures the stack (live call site), onEnd reads
 *    db.system/db.statement (sanitized) and builds a DbQuery with SourceRef;
 *  - request_handler span (express): stores the handler name;
 *  - end of the server span (request root in this process): builds the
 *    BackendTrace with traceId (from the received traceparent), route, handler,
 *    queries and duration, and sends it to the sink.
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
      // At the start of the DB span the stack still holds the app frames.
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
