// @eregion/config — helpers de configuração compartilhados pelo tooling Node.
export const PKG = '@eregion/config' as const;

export { findRepoRoot } from './repo-root.js';
export {
  DAEMON_DIR,
  DAEMON_FILE,
  STATE_FILE,
  readDaemonInfo,
  writeDaemonInfo,
  removeDaemonInfo,
  readDaemonState,
  writeDaemonState,
  type DaemonInfo,
  type DaemonState,
} from './daemon-files.js';
