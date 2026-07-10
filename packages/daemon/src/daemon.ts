import { randomBytes } from 'node:crypto';
import {
  findRepoRoot,
  readDaemonState,
  removeDaemonInfo,
  writeDaemonInfo,
  writeDaemonState,
} from '@eregion/config';
import { AgentRuntime } from './agent-runtime.js';
import { AngularIndexer } from './angular-indexer.js';
import { InstrumentationCache } from './instrumentation-cache.js';
import { createInstrumentationServer } from './mcp-tools.js';
import { discoverModels } from './model-catalog.js';
import { PermissionBroker } from './permission-broker.js';
import { RuntimePool } from './runtime-pool.js';
import { DaemonServer } from './server.js';
import { TraceStore } from './trace-store.js';

export const VERSION = '0.0.0';
const PORT_RANGE_START = 47100;
const PORT_RANGE_END = 47199;
/** Sessões paralelas por default; cada uma paga o próprio prefixo de cache. */
const DEFAULT_PARALLEL = 2;

export interface DaemonOptions {
  cwd?: string;
  /** Máximo de sessões de IA em paralelo (1 = comportamento antigo). */
  parallel?: number;
}

export interface Daemon {
  port: number;
  repoRoot: string;
  server: DaemonServer;
  pool: RuntimePool;
  stop(): Promise<void>;
}

/**
 * Composição do daemon: cache ← overlay; MCP tools ← cache; pool de sessões
 * vivas ← tools + broker; server ← tudo. Escreve .eregion/daemon.json para o
 * plugin de build injetar {porta, token} no bundle dev.
 */
export async function startDaemon(options: DaemonOptions = {}): Promise<Daemon> {
  const repoRoot = findRepoRoot(options.cwd ?? process.cwd());
  const parallel = Math.max(1, options.parallel ?? DEFAULT_PARALLEL);
  const token = randomBytes(24).toString('base64url');
  const cache = new InstrumentationCache();
  const traceStore = new TraceStore();
  const state = readDaemonState(repoRoot);
  // Compat: estados antigos tinham um sessionId único (vira o slot 0).
  const sessionIds: (string | undefined)[] = state.sessionIds ?? [state.sessionId];

  // O broker pergunta ao overlay via broadcast; o server ainda não existe
  // neste ponto, então a referência é ligada logo abaixo.
  const broker = new PermissionBroker([repoRoot], (req) => {
    server.broadcast({ type: 'permission.request', payload: req });
  });
  const mcpServer = createInstrumentationServer(cache, repoRoot, traceStore);

  const pool = new RuntimePool({
    size: parallel,
    emit: (msg) => server.broadcast(msg),
    makeRuntime: (slotIndex, events) =>
      new AgentRuntime(
        {
          cwd: repoRoot,
          resumeSessionId: sessionIds[slotIndex],
          mcpServer,
          broker,
        },
        {
          ...events,
          onSessionInit(sessionId) {
            sessionIds[slotIndex] = sessionId;
            writeDaemonState(repoRoot, { sessionIds: sessionIds.map((s) => s ?? '') });
          },
        },
      ),
  });

  // Índice Angular construído sob demanda (lazy) na primeira requisição do
  // overlay — instanciar é barato; o scan só roda se for um app Angular.
  const angularIndexer = new AngularIndexer(repoRoot);

  // Descoberta assíncrona: hello.ok leva a lista se já resolveu; senão o
  // models.update chega no broadcast assim que a sonda responder.
  let models: import('@eregion/protocol').ModelOption[] = [];
  void discoverModels(repoRoot).then((found) => {
    models = found;
    if (found.length > 0) server.broadcast({ type: 'models.update', payload: { models: found } });
  });

  const server = new DaemonServer({
    token,
    repoRoot,
    appVersion: VERSION,
    cache,
    broker,
    pool,
    angularIndexer,
    traceStore,
    getModels: () => models,
  });

  let port = PORT_RANGE_START;
  while (true) {
    try {
      await server.listen(port);
      break;
    } catch (err) {
      if (port >= PORT_RANGE_END) throw err;
      port += 1;
    }
  }

  writeDaemonInfo(repoRoot, { port, token, pid: process.pid });

  return {
    port,
    repoRoot,
    server,
    pool,
    async stop() {
      removeDaemonInfo(repoRoot);
      await pool.close();
      await server.close();
    },
  };
}
