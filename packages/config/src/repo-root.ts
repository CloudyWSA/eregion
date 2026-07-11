import { existsSync, statSync } from 'node:fs';
import path from 'node:path';

const rootCache = new Map<string, string>();

function startDirOf(from: string): string {
  try {
    if (statSync(from).isDirectory()) return from;
  } catch {
    // file not yet written to disk (e.g. in-memory transform) — use its directory
  }
  return path.dirname(from);
}

/**
 * Repository root: the first directory with a .git going up from `from` (file or
 * directory); falls back to process.cwd(). All Eregion paths (tagging, payload,
 * daemon) are relative to this root.
 */
export function findRepoRoot(from: string): string {
  const dir = startDirOf(from);
  const cached = rootCache.get(dir);
  if (cached) return cached;
  let current = dir;
  while (true) {
    if (existsSync(path.join(current, '.git'))) break;
    const parent = path.dirname(current);
    if (parent === current) {
      current = process.cwd();
      break;
    }
    current = parent;
  }
  rootCache.set(dir, current);
  return current;
}
