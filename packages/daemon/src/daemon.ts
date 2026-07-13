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
import { discoverCatalog } from './model-catalog.js';
import { PermissionBroker } from './permission-broker.js';
import { RuntimePool } from './runtime-pool.js';
import { DaemonServer } from './server.js';
import { TraceStore } from './trace-store.js';

export const VERSION = '0.1.0';
const PORT_RANGE_START = 47100;
const PORT_RANGE_END = 47199;
/** Parallel sessions by default; each pays for its own cache prefix. */
const DEFAULT_PARALLEL = 2;

export interface DaemonOptions {
  cwd?: string;
  /** Max parallel AI sessions (1 = legacy behavior). */
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
 * Daemon composition: cache ← overlay; MCP tools ← cache; pool of live
 * sessions ← tools + broker; server ← everything. Writes .eregion/daemon.json
 * so the build plugin can inject {port, token} into the dev bundle.
 */
export async function startDaemon(options: DaemonOptions = {}): Promise<Daemon> {
  const repoRoot = findRepoRoot(options.cwd ?? process.cwd());
  const parallel = Math.max(1, options.parallel ?? DEFAULT_PARALLEL);
  const token = randomBytes(24).toString('base64url');
  const cache = new InstrumentationCache();
  const traceStore = new TraceStore();
  const state = readDaemonState(repoRoot);
  // Compat: old states had a single sessionId (becomes slot 0).
  const sessionIds: (string | undefined)[] = state.sessionIds ?? [state.sessionId];

  // The broker asks the overlay via broadcast; the server doesn't exist yet
  // here, so the reference is wired just below.
  const broker = new PermissionBroker([repoRoot], (req) => {
    server.broadcast({ type: 'permission.request', payload: req });
  });
  const mcpServer = createInstrumentationServer(cache, repoRoot, traceStore);

  // Session-lifetime totals, summed from each chat.result and rebroadcast.
  const usageTotals = { jobs: 0, outputTokens: 0, costUsd: 0 };

  const pool = new RuntimePool({
    size: parallel,
    emit: (msg) => {
      server.broadcast(msg);
      if (msg.type === 'chat.result') {
        usageTotals.jobs += 1;
        usageTotals.outputTokens += msg.payload.usage.outputTokens;
        usageTotals.costUsd += msg.payload.usage.costUsd ?? 0;
        server.broadcast({ type: 'usage.update', payload: { ...usageTotals } });
      }
    },
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

  // Angular index built lazily on the overlay's first request — instantiation
  // is cheap; the scan only runs for an Angular app.
  const angularIndexer = new AngularIndexer(repoRoot);

  // Async discovery: hello.ok carries the lists if already resolved; otherwise
  // models.update arrives on broadcast once the probe responds.
  let models: import('@eregion/protocol').ModelOption[] = [];
  let skills: import('@eregion/protocol').SkillOption[] = [];
  void discoverCatalog(repoRoot).then((found) => {
    models = found.models;
    skills = found.skills;
    if (found.models.length > 0 || found.skills.length > 0)
      server.broadcast({ type: 'models.update', payload: { models: found.models, skills: found.skills } });
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
    getSkills: () => skills,
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
