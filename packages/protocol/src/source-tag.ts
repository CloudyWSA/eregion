import type { SourceRef } from './selection-payload.js';

/**
 * Atributo injetado em build-time nos elementos host (JSX/templates) com a
 * origem no código: "<path relativo ao root do repo>:<linha>:<coluna>",
 * ambos 1-based. Este é o contrato entre @eregion/build (escreve) e
 * @eregion/overlay (lê) — o formato só muda aqui.
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
