// @eregion/node-agent — backend OTel agent: reports traces to the local daemon.
import { createRequire } from 'node:module';
import {
  context,
  propagation,
  SpanKind,
  trace,
  type Span,
  type TextMapGetter,
} from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { registerInstrumentations, type Instrumentation } from '@opentelemetry/instrumentation';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { findRepoRoot, readDaemonInfo } from '@eregion/config';
import { TraceSender } from './sender.js';
import { CaptureOptions, EregionSpanProcessor, type TraceSink } from './span-processor.js';

export const PKG = '@eregion/node-agent' as const;
export { EregionSpanProcessor } from './span-processor.js';
export { firstAppFrame, parseStackFrame, sanitizeStatement } from './sanitize.js';
export { TraceSender } from './sender.js';
export type { CaptureOptions, TraceSink } from './span-processor.js';

const TRACER_NAME = '@eregion/node-agent';

export interface InitOptions {
  /** Filters for what to capture per trace (statements/stack). */
  capture?: CaptureOptions;
  /** Overrides the backend repo root (default: findRepoRoot(cwd)). */
  cwd?: string;
  /** Alternative sink (tests); default: POST to the daemon. */
  sink?: TraceSink;
}

let initialized = false;

/**
 * Instruments the Node/Bun process: registers the W3C propagator, the
 * AsyncLocalStorage context manager, available instrumentations and the Eregion
 * SpanProcessor. No-op in production or when there is no daemon.
 */
export function init(options: InitOptions = {}): boolean {
  if (initialized) return true;
  if (process.env.NODE_ENV === 'production') return false;

  const repoRoot = findRepoRoot(options.cwd ?? process.cwd());
  // No daemon.json means nowhere to send — skip instrumenting.
  if (!options.sink && !readDaemonInfo(repoRoot)) return false;

  const sink: TraceSink = options.sink ?? new TraceSender(repoRoot);
  const processor = new EregionSpanProcessor(repoRoot, sink, options.capture ?? {});

  const provider = new NodeTracerProvider({ spanProcessors: [processor] });
  provider.register({
    propagator: new W3CTraceContextPropagator(),
    contextManager: new AsyncLocalStorageContextManager().enable(),
  });

  registerInstrumentations({
    tracerProvider: provider,
    instrumentations: [new HttpInstrumentation(), ...loadOptionalInstrumentations()],
  });

  initialized = true;
  return true;
}

/**
 * Instrumentations that depend on modules which may not be installed in the
 * user's backend (express/pg/mysql2/mongodb). Loaded via try/catch so that
 * backends using only http don't break.
 */
function loadOptionalInstrumentations(): Instrumentation[] {
  const require = createRequire(import.meta.url);
  const out: Instrumentation[] = [];
  const optional: Array<[string, string]> = [
    ['@opentelemetry/instrumentation-express', 'ExpressInstrumentation'],
    ['@opentelemetry/instrumentation-pg', 'PgInstrumentation'],
    ['@opentelemetry/instrumentation-mysql2', 'MySQL2Instrumentation'],
    ['@opentelemetry/instrumentation-mongodb', 'MongoDBInstrumentation'],
  ];
  for (const [mod, cls] of optional) {
    try {
      const loaded = require(mod) as Record<string, new () => Instrumentation>;
      const Ctor = loaded[cls];
      if (Ctor) out.push(new Ctor());
    } catch {
      // module unavailable in the backend — ignore.
    }
  }
  return out;
}

const headerGetter: TextMapGetter<Headers> = {
  keys: (carrier) => [...carrier.keys()],
  get: (carrier, key) => carrier.get(key) ?? undefined,
};

/**
 * Wrapper for `Bun.serve` (which has no http instrumentation): opens a SERVER
 * span with the received traceparent context, runs the handler inside it and
 * ends it — the SpanProcessor then builds and sends the BackendTrace.
 */
export function withEregionTrace<A extends unknown[]>(
  handler: (req: Request, ...rest: A) => Response | Promise<Response>,
): (req: Request, ...rest: A) => Promise<Response> {
  return async (req: Request, ...rest: A): Promise<Response> => {
    const tracer = trace.getTracer(TRACER_NAME);
    const parentCtx = propagation.extract(context.active(), req.headers, headerGetter);
    const url = new URL(req.url);
    const span: Span = tracer.startSpan(
      `${req.method} ${url.pathname}`,
      {
        kind: SpanKind.SERVER,
        attributes: { 'http.method': req.method, 'http.target': url.pathname, 'http.url': req.url },
      },
      parentCtx,
    );
    const ctx = trace.setSpan(parentCtx, span);
    try {
      const res = await context.with(ctx, () => handler(req, ...rest));
      span.setAttribute('http.status_code', res.status);
      return res;
    } finally {
      span.end();
    }
  };
}
