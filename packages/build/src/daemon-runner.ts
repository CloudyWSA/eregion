import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { findRepoRoot, readDaemonInfo, type DaemonInfo } from '@eregion/config';

export interface DaemonRunnerOptions {
  parallel?: number;
  log?: (msg: string) => void;
}

let child: ChildProcess | null = null;

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function runningDaemon(repoRoot: string): DaemonInfo | null {
  const info = readDaemonInfo(repoRoot);
  return info && pidAlive(info.pid) ? info : null;
}

function resolveDaemonCli(repoRoot: string): string | null {
  for (const from of [path.join(repoRoot, 'index.js'), import.meta.url]) {
    try {
      const main = createRequire(from).resolve('@eregion/daemon');
      const cli = path.join(path.dirname(main), 'cli.js');
      if (existsSync(cli)) return cli;
    } catch {
      // try the next resolution base
    }
  }
  return null;
}

function spawnDaemon(repoRoot: string, opts: DaemonRunnerOptions): boolean {
  if (child) return true;
  const cli = resolveDaemonCli(repoRoot);
  if (!cli) {
    opts.log?.('daemon package not found — run `npm i -D @eregion/daemon` (or `npx eregion-dev`).');
    return false;
  }
  const args = [cli];
  if (opts.parallel) args.push('--parallel', String(opts.parallel));
  const proc = spawn(process.execPath, args, { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'] });
  child = proc;
  const forward = (buf: Buffer) => {
    const line = buf.toString().trimEnd();
    if (line) opts.log?.(line);
  };
  proc.stdout?.on('data', forward);
  proc.stderr?.on('data', forward);
  proc.on('exit', () => {
    child = null;
  });
  process.once('exit', () => {
    if (child && !child.killed) child.kill();
  });
  return true;
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Spawns the daemon alongside the dev server if one isn't already running, and
 * resolves once `.eregion/daemon.json` is ready. Async path (Vite `configureServer`).
 */
export async function ensureDaemon(opts: DaemonRunnerOptions = {}): Promise<DaemonInfo | null> {
  const repoRoot = findRepoRoot(process.cwd());
  const running = runningDaemon(repoRoot);
  if (running) return running;
  if (!spawnDaemon(repoRoot, opts)) return null;
  for (let i = 0; i < 100; i += 1) {
    const info = runningDaemon(repoRoot);
    if (info) {
      opts.log?.(`ready on 127.0.0.1:${info.port}`);
      return info;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  opts.log?.('daemon did not become ready in time — see the logs above.');
  return null;
}

/**
 * Same as {@link ensureDaemon} but blocks briefly instead of awaiting — for
 * sync contexts like a Next.js `next.config` load.
 */
export function ensureDaemonSync(opts: DaemonRunnerOptions = {}): DaemonInfo | null {
  const repoRoot = findRepoRoot(process.cwd());
  const running = runningDaemon(repoRoot);
  if (running) return running;
  if (!spawnDaemon(repoRoot, opts)) return null;
  for (let i = 0; i < 100; i += 1) {
    const info = runningDaemon(repoRoot);
    if (info) return info;
    sleepSync(100);
  }
  return null;
}
