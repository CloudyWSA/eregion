import type { SourceRef } from './selection-payload.js';

/**
 * Attribute injected at build time on host elements (JSX/templates) with the
 * code origin: "<path relative to repo root>:<line>:<column>", both 1-based.
 * This is the contract between @eregion/build (writes) and @eregion/overlay
 * (reads) — the format changes only here.
 */
export const TAG_ATTR = 'data-eg-src';

export function formatTagValue(ref: Required<SourceRef>): string {
  return `${ref.file}:${ref.line}:${ref.column}`;
}

export function parseTagValue(value: string): Required<SourceRef> | null {
  const columnCut = value.lastIndexOf(':');
  const lineCut = value.lastIndexOf(':', columnCut - 1);
  if (lineCut <= 0) return null;

  const file = value.slice(0, lineCut);
  const line = Number(value.slice(lineCut + 1, columnCut));
  const column = Number(value.slice(columnCut + 1));
  if (!Number.isInteger(line) || line < 1 || !Number.isInteger(column) || column < 1) return null;

  return { file, line, column };
}
