import path from 'node:path';
import type { SourceRef } from '@eregion/protocol';

/** Defensive limit to avoid sending huge statements to the daemon. */
const MAX_STMT_LEN = 500;

/**
 * Sanitizes a SQL statement by replacing literals (inline bind params): single
 * quoted strings and numbers become "?". Collapses whitespace and truncates.
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
 * Extracts file/line/column from a stack line ("    at fn (/a/b.ts:1:2)" or
 * "    at /a/b.ts:1:2"). Uses lastIndexOf instead of split because the path can
 * contain ":" (file:// URLs, Windows drives).
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

  // ESM in Node yields "file:///abs/path" — normalize to a disk path.
  if (file.startsWith('file://')) file = file.slice('file://'.length);

  return { file, line: lineNo, column: colNo };
}

/**
 * First stack frame pointing at app code (outside node_modules and within
 * repoRoot), converted to a SourceRef relative to repoRoot. Returns undefined
 * when there is no attributable frame (e.g. everything in node_modules).
 */
export function firstAppFrame(stack: string | undefined, repoRoot: string): SourceRef | undefined {
  if (!stack) return undefined;
  const lines = stack.split('\n');
  for (const raw of lines) {
    const frame = parseStackFrame(raw);
    if (!frame) continue;
    if (frame.file.includes('node_modules')) continue;
    if (frame.file.includes('node-agent/dist') || frame.file.includes('node-agent/src')) continue;
    if (!path.isAbsolute(frame.file)) continue;
    const rel = path.relative(repoRoot, frame.file);
    // Outside the repo (starts with ".." or is absolute again) → ignore.
    if (rel.startsWith('..') || path.isAbsolute(rel)) continue;
    return { file: rel.split(path.sep).join('/'), line: frame.line, column: frame.column };
  }
  return undefined;
}
