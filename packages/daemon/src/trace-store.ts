import type { BackendTrace } from '@eregion/protocol';

/** Default in-memory trace TTL: 10 minutes. */
const DEFAULT_TTL_MS = 10 * 60 * 1000;

interface Entry {
  trace: BackendTrace;
  at: number;
}

/**
 * Holds the BackendTraces received from node-agent, indexed by traceId, with
 * a short TTL (a trace only matters while its selection is alive). Cleanup
 * runs on insert — no timers, no background state.
 */
export class TraceStore {
  private map = new Map<string, Entry>();

  constructor(private ttlMs: number = DEFAULT_TTL_MS) {}

  insert(trace: BackendTrace): void {
    this.evict();
    this.map.set(trace.traceId, { trace, at: Date.now() });
  }

  get(traceId: string): BackendTrace | null {
    const entry = this.map.get(traceId);
    if (!entry) return null;
    if (Date.now() - entry.at > this.ttlMs) {
      this.map.delete(traceId);
      return null;
    }
    return entry.trace;
  }

  private evict(): void {
    const cutoff = Date.now() - this.ttlMs;
    for (const [id, entry] of this.map) {
      if (entry.at < cutoff) this.map.delete(id);
    }
  }
}
