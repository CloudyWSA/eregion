import { z } from 'zod';
import { SourceRef } from './selection-payload.js';

/**
 * Static index of Angular components built by the daemon (decorators parsed
 * with ts-morph — the app build is untouched). The overlay receives the compact
 * index after hello and resolves components in memory, synchronously.
 *
 * Real-app finding: {className+selector} collides — the index carries the origin
 * project, and the adapter disambiguates by DOM ancestors.
 */
export const AngularComponentEntry = z.object({
  className: z.string(),
  /** Component CSS selector; attribute directives included. */
  selector: z.string().optional(),
  /** Origin project in the Angular monorepo (near-duplicate apps exist). */
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
