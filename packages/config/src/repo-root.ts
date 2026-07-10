import { existsSync, statSync } from 'node:fs';
import path from 'node:path';

const rootCache = new Map<string, string>();

function startDirOf(from: string): string {
  try {
    if (statSync(from).isDirectory()) return from;
  } catch {
    // arquivo ainda não escrito em disco (ex: transform em memória) — usa o diretório dele
  }
  return path.dirname(from);
}

/**
 * Root do repositório: primeiro diretório com .git subindo a partir de `from`
 * (arquivo ou diretório); fallback process.cwd(). Todos os paths do Eregion
 * (tagging, payload, daemon) são relativos a este root.
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
