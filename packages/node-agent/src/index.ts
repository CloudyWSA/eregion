// @eregion/node-agent — agente OTel do backend: reporta traces ao daemon local.
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
  /** Filtros do que capturar por trace (statements/stack). */
  capture?: CaptureOptions;
  /** Sobrescreve o repo root do backend (default: findRepoRoot(cwd)). */
  cwd?: string;
  /** Sink alternativo (testes); default: POST ao daemon. */
  sink?: TraceSink;
}

let initialized = false;

/**
 * Instrumenta o processo Node/Bun: registra W3C propagator + AsyncLocalStorage
 * context manager + instrumentations disponíveis + o SpanProcessor do Eregion.
 * No-op total em produção ou quando não há daemon (.eregion/daemon.json ausente)
 * — o agente nunca deve pesar em produção nem falhar se o daemon não subiu.
 */
export function init(options: InitOptions = {}): boolean {
  if (initialized) return true;
  if (process.env.NODE_ENV === 'production') return false;

  const repoRoot = findRepoRoot(options.cwd ?? process.cwd());
  // Sem daemon.json não há para onde mandar — evita instrumentar à toa.
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
 * Instrumentations que dependem de módulos que podem não estar instalados no
 * backend do usuário (express/pg/mysql2/mongodb). Import dinâmico com try/catch
 * para não quebrar quem só usa http.
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
      // require síncrono: as deps estão no node-agent; ausência → catch.
      const loaded = require(mod) as Record<string, new () => Instrumentation>;
      const Ctor = loaded[cls];
      if (Ctor) out.push(new Ctor());
    } catch {
      // módulo indisponível no backend — ignora.
    }
  }
  return out;
}

const headerGetter: TextMapGetter<Headers> = {
  keys: (carrier) => [...carrier.keys()],
  get: (carrier, key) => carrier.get(key) ?? undefined,
};

/**
 * Wrapper para `Bun.serve` (que não tem instrumentation de http): abre um span
 * SERVER com o contexto do traceparent recebido, roda o handler dentro dele e
 * fecha — o SpanProcessor então monta e envia o BackendTrace.
 *
 *   Bun.serve({ fetch: withEregionTrace(async (req) => new Response('ok')) });
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
