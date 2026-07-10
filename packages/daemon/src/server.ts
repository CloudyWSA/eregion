import { createServer, type IncomingMessage, type Server } from 'node:http';
import {
  BackendTrace,
  makeEnvelope,
  parseClientMessage,
  SelectionPayload,
  type ClientMessage,
  type DaemonMessage,
} from '@eregion/protocol';
import { WebSocketServer, type WebSocket } from 'ws';
import type { AngularIndexer } from './angular-indexer.js';
import type { InstrumentationCache } from './instrumentation-cache.js';
import type { PermissionBroker } from './permission-broker.js';
import type { RuntimePool } from './runtime-pool.js';
import type { TraceStore } from './trace-store.js';

export interface ServerOptions {
  token: string;
  repoRoot: string;
  appVersion: string;
  cache: InstrumentationCache;
  broker: PermissionBroker;
  pool: RuntimePool;
  /** Índice Angular servido sob demanda (apps Angular apenas). */
  angularIndexer?: AngularIndexer;
  /** Modelos permitidos pela conta do dev (descobertos em runtime). */
  getModels?: () => import('@eregion/protocol').ModelOption[];
  /** Traces do backend (node-agent) recebidos via POST /trace/ingest. */
  traceStore: TraceStore;
}

const HELLO_DEADLINE_MS = 5_000;

function originAllowed(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true; // clientes não-browser (testes, CLI)
  try {
    const { hostname } = new URL(origin);
    return hostname === 'localhost' || hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

/**
 * Servidor do daemon: HTTP para descoberta (/.well-known/eregion) + WS para
 * overlay/chat. Bind exclusivo em 127.0.0.1; toda conexão precisa mandar
 * `hello` com o token (injetado no bundle dev) antes de qualquer outra coisa.
 */
export class DaemonServer {
  private http: Server;
  private wss: WebSocketServer;
  private authorized = new Set<WebSocket>();
  private nextEnvelopeId = 1;

  constructor(private options: ServerOptions) {
    this.http = createServer((req, res) => {
      // Mesma regra de origem do WS — evita leitura via DNS rebinding.
      const host = req.headers.host?.split(':')[0];
      if ((host !== '127.0.0.1' && host !== 'localhost') || !originAllowed(req)) {
        res.statusCode = 403;
        res.end();
        return;
      }
      if (req.url === '/.well-known/eregion') {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ root: options.repoRoot, version: options.appVersion }));
        return;
      }
      // Ingestão de traces do backend instrumentado (node-agent).
      if (req.method === 'POST' && req.url === '/trace/ingest') {
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => {
          let body: unknown;
          try {
            body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          } catch {
            res.statusCode = 400;
            res.end();
            return;
          }
          const parsed = BackendTrace.safeParse(body);
          if (!parsed.success) {
            res.statusCode = 400;
            res.end();
            return;
          }
          options.traceStore.insert(parsed.data);
          res.statusCode = 204;
          res.end();
        });
        return;
      }
      res.statusCode = 404;
      res.end();
    });
    this.wss = new WebSocketServer({ server: this.http, path: '/ws' });
    this.wss.on('connection', (ws, req) => this.onConnection(ws, req));
  }

  listen(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.http.once('error', reject);
      this.http.listen(port, '127.0.0.1', () => resolve());
    });
  }

  async close(): Promise<void> {
    for (const ws of this.wss.clients) ws.terminate();
    await new Promise<void>((resolve) => this.wss.close(() => resolve()));
    await new Promise<void>((resolve) => this.http.close(() => resolve()));
  }

  /** Envia para todos os clientes autorizados (várias abas compartilham a sessão). */
  broadcast(msg: DaemonMessage): void {
    const raw = JSON.stringify(makeEnvelope(`d${this.nextEnvelopeId++}`, msg));
    for (const ws of this.authorized) ws.send(raw);
  }

  private onConnection(ws: WebSocket, req: IncomingMessage): void {
    if (!originAllowed(req)) {
      this.send(ws, { type: 'hello.error', payload: { code: 'origin_denied', message: 'Origin não permitida.' } });
      ws.close();
      return;
    }
    const deadline = setTimeout(() => {
      if (!this.authorized.has(ws)) ws.close();
    }, HELLO_DEADLINE_MS);

    ws.on('message', (data) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(data));
      } catch {
        this.send(ws, { type: 'error', payload: { code: 'bad_message', message: 'frame não é JSON' } });
        return;
      }
      const res = parseClientMessage(parsed);
      if (!res.ok) {
        this.send(ws, { type: 'error', payload: { code: 'bad_message', message: res.error } });
        return;
      }
      this.route(ws, res.msg);
    });
    ws.on('close', () => {
      clearTimeout(deadline);
      this.authorized.delete(ws);
    });
    ws.on('error', () => ws.close());
  }

  private route(ws: WebSocket, msg: ClientMessage & { id: string }): void {
    if (msg.type === 'hello') {
      if (msg.payload.token !== this.options.token) {
        this.send(ws, { type: 'hello.error', payload: { code: 'bad_token', message: 'Token inválido.' } });
        ws.close();
        return;
      }
      this.authorized.add(ws);
      this.send(ws, {
        type: 'hello.ok',
        payload: {
          sessionId: this.options.pool.primarySessionId,
          model: 'default',
          cwd: this.options.repoRoot,
          models: this.options.getModels?.() ?? [],
        },
      });
      return;
    }

    if (!this.authorized.has(ws)) {
      ws.close();
      return;
    }

    switch (msg.type) {
      case 'selection.update': {
        const parsed = SelectionPayload.safeParse(msg.payload.payload);
        if (parsed.success) this.options.cache.setSelection(parsed.data);
        return;
      }
      case 'chat.send': {
        const refs = msg.payload.attachSelection ? this.options.cache.compactRefs() : [];
        const text = refs.length > 0 ? `${refs.join('\n')}\n\n${msg.payload.text}` : msg.payload.text;
        this.options.pool.dispatch({ jobId: msg.payload.jobId ?? msg.id, text, model: msg.payload.model });
        this.broadcast({ type: 'status', payload: { state: 'thinking' } });
        return;
      }
      case 'chat.cancel': {
        void this.options.pool
          .cancel(msg.payload.jobId)
          .then(() => this.broadcast({ type: 'status', payload: { state: 'idle' } }));
        return;
      }
      case 'permission.respond': {
        this.options.broker.respond(msg.payload.requestId, msg.payload.allow);
        return;
      }
      case 'mode.set': {
        this.options.broker.mode = msg.payload.mode;
        return;
      }
      case 'changes.revert': {
        this.options.pool
          .rewindFiles(msg.payload.checkpointId)
          .then(() => this.broadcast({ type: 'status', payload: { state: 'idle' } }))
          .catch((err: Error) =>
            this.send(ws, { type: 'error', payload: { code: 'rewind_failed', message: err.message } }),
          );
        return;
      }
      case 'angular.index.get': {
        const indexer = this.options.angularIndexer;
        if (!indexer) return;
        try {
          this.send(ws, { type: 'angular.index', payload: { index: indexer.getIndex() } });
        } catch (err) {
          this.send(ws, {
            type: 'error',
            payload: { code: 'angular_index_failed', message: (err as Error).message },
          });
        }
        return;
      }
    }
  }

  private send(ws: WebSocket, msg: DaemonMessage): void {
    ws.send(JSON.stringify(makeEnvelope(`d${this.nextEnvelopeId++}`, msg)));
  }
}
