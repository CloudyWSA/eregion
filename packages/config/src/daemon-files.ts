import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Arquivos de runtime do daemon dentro do repo do app (git-ignorados):
 *  - daemon.json: descoberta pelo plugin de build (porta + token desta máquina)
 *  - state.json: continuidade da sessão de IA entre restarts do daemon
 */
export const DAEMON_DIR = '.eregion';
export const DAEMON_FILE = 'daemon.json';
export const STATE_FILE = 'state.json';

export interface DaemonInfo {
  port: number;
  token: string;
  pid: number;
}

export interface DaemonState {
  /** Legado (pool de 1 sessão) — lido como slot 0. */
  sessionId?: string;
  /** Uma sessão viva por slot do pool, na ordem dos slots. */
  sessionIds?: string[];
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

function writeJson(file: string, value: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

export function removeDaemonInfo(repoRoot: string): void {
  try {
    rmSync(path.join(repoRoot, DAEMON_DIR, DAEMON_FILE));
  } catch {
    // já não existe — nada a fazer
  }
}

export function readDaemonInfo(repoRoot: string): DaemonInfo | null {
  return readJson<DaemonInfo>(path.join(repoRoot, DAEMON_DIR, DAEMON_FILE));
}

export function writeDaemonInfo(repoRoot: string, info: DaemonInfo): void {
  writeJson(path.join(repoRoot, DAEMON_DIR, DAEMON_FILE), info);
}

export function readDaemonState(repoRoot: string): DaemonState {
  return readJson<DaemonState>(path.join(repoRoot, DAEMON_DIR, STATE_FILE)) ?? {};
}

export function writeDaemonState(repoRoot: string, state: DaemonState): void {
  writeJson(path.join(repoRoot, DAEMON_DIR, STATE_FILE), state);
}
