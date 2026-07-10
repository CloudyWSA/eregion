import path from 'node:path';
import type { SourceRef } from '@eregion/protocol';

/** Limite defensivo para não trafegar statements gigantes ao daemon. */
const MAX_STMT_LEN = 500;

/**
 * Sanitiza um SQL statement removendo literais (bind params inline): strings
 * entre aspas simples e números viram "?". Colapsa espaços e trunca. Regex é
 * inevitável aqui — reconhecer literais SQL não se resolve com split.
 */
export function sanitizeStatement(stmt: string): string {
  const collapsed = stmt.replace(/\s+/g, ' ').trim();
  const noStrings = collapsed.replace(/'(?:[^']|'')*'/g, '?');
  const noNumbers = noStrings.replace(/\b\d+\b/g, '?');
  return noNumbers.length > MAX_STMT_LEN ? `${noNumbers.slice(0, MAX_STMT_LEN)}…` : noNumbers;
}

interface RawFrame {
  file: string;
  line: number;
  column: number;
}

/**
 * Extrai file/line/column de uma linha de stack ("    at fn (/a/b.ts:1:2)" ou
 * "    at /a/b.ts:1:2"). Usa lastIndexOf em vez de split porque o caminho pode
 * conter ":" (URLs file://, drives no Windows).
 */
export function parseStackFrame(line: string): RawFrame | null {
  const at = line.trim();
  if (!at.startsWith('at ')) return null;
  let loc = at.slice(3);

  const open = loc.lastIndexOf('(');
  if (open >= 0) {
    const close = loc.lastIndexOf(')');
    loc = loc.slice(open + 1, close > open ? close : undefined);
  }

  const colCut = loc.lastIndexOf(':');
  const lineCut = loc.lastIndexOf(':', colCut - 1);
  if (colCut < 0 || lineCut < 0) return null;

  let file = loc.slice(0, lineCut);
  const lineNo = Number(loc.slice(lineCut + 1, colCut));
  const colNo = Number(loc.slice(colCut + 1));
  if (!Number.isFinite(lineNo) || !Number.isFinite(colNo)) return null;

  // ESM em Node dá "file:///abs/path" — normaliza para caminho de disco.
  if (file.startsWith('file://')) file = file.slice('file://'.length);

  return { file, line: lineNo, column: colNo };
}

/**
 * Primeiro frame do stack que aponta para código do app (fora de node_modules
 * e dentro do repoRoot), convertido em SourceRef relativo ao repoRoot. Retorna
 * undefined se não houver frame atribuível (ex: tudo em node_modules).
 */
export function firstAppFrame(stack: string | undefined, repoRoot: string): SourceRef | undefined {
  if (!stack) return undefined;
  const lines = stack.split('\n');
  for (const raw of lines) {
    const frame = parseStackFrame(raw);
    if (!frame) continue;
    if (frame.file.includes('node_modules')) continue;
    if (!path.isAbsolute(frame.file)) continue;
    const rel = path.relative(repoRoot, frame.file);
    // Fora do repo (começa com ".." ou vira absoluto de novo) → ignora.
    if (rel.startsWith('..') || path.isAbsolute(rel)) continue;
    return { file: rel.split(path.sep).join('/'), line: frame.line, column: frame.column };
  }
  return undefined;
}
