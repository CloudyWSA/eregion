import { z } from 'zod';
import { SourceRef } from './selection-payload.js';

/**
 * Índice estático de componentes Angular construído pelo daemon (parse dos
 * decorators com ts-morph — o build do app não é tocado). O overlay recebe o
 * índice compacto após o hello e resolve componentes em memória, síncrono.
 *
 * Achado do spike em app Angular real: {className+selector} tem colisões — o índice
 * carrega o projeto de origem, e o adapter desambigua por ancestrais no DOM.
 */
export const AngularComponentEntry = z.object({
  className: z.string(),
  /** Selector CSS do componente; diretivas de atributo incluídas. */
  selector: z.string().optional(),
  /** Projeto do monorepo Angular (apps quase-duplicados existem). */
  project: z.string().optional(),
  src: SourceRef,
  template: SourceRef.optional(),
});
export type AngularComponentEntry = z.infer<typeof AngularComponentEntry>;

export const AngularIndex = z.object({
  entries: z.array(AngularComponentEntry),
  builtAtMs: z.number(),
});
export type AngularIndex = z.infer<typeof AngularIndex>;
