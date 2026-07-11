import { z } from 'zod';
import { SourceRef } from './selection-payload.js';

/**
 * Trace sent by the instrumented backend (@eregion/node-agent) to the daemon
 * via HTTP POST /trace/ingest. Correlated with the frontend by the traceId the
 * overlay injects into the traceparent/x-eg-trace header.
 */
export const DbQuery = z.object({
  /** System: 'pg', 'mysql', 'mongodb', … (semconv db.system) */
  db: z.string(),
  /** Sanitized statement (no bind params by default) */
  stmt: z.string(),
  src: SourceRef.optional(),
  ms: z.number().nonnegative().optional(),
});
export type DbQuery = z.infer<typeof DbQuery>;

export const BackendTrace = z.object({
  traceId: z.string().min(1),
  /** "GET /api/orders" */
  route: z.string().optional(),
  handler: z
    .object({ name: z.string(), src: SourceRef.optional() })
    .optional(),
  queries: z.array(DbQuery),
  durationMs: z.number().nonnegative().optional(),
});
export type BackendTrace = z.infer<typeof BackendTrace>;
