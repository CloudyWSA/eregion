import { z } from 'zod';
import { SourceRef } from './selection-payload.js';

/**
 * Trace enviado pelo backend instrumentado (@eregion/node-agent) ao daemon
 * via HTTP POST /trace/ingest. Correlacionado com o frontend pelo traceId
 * que o overlay injeta no header traceparent/x-eg-trace.
 */
export const DbQuery = z.object({
  /** Sistema: 'pg', 'mysql', 'mongodb', … (semconv db.system) */
  db: z.string(),
  /** Statement sanitizado (sem bind params por default) */
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
