// @eregion/daemon — local daemon: live Claude Agent SDK session + MCP tools.
export const PKG = '@eregion/daemon' as const;

export { startDaemon, VERSION, type Daemon, type DaemonOptions } from './daemon.js';
export { RuntimePool, type PoolJob, type PoolOptions } from './runtime-pool.js';
export { AgentRuntime, type RuntimeEvents, type RuntimeOptions } from './agent-runtime.js';
export { DaemonServer, type ServerOptions } from './server.js';
export { PermissionBroker, type PermissionMode, type PermissionRequestEvent } from './permission-broker.js';
export { InstrumentationCache } from './instrumentation-cache.js';
export { createInstrumentationServer, MCP_SERVER_NAME } from './mcp-tools.js';
