import type { BackendTrace } from '@eregion/protocol';

/** TTL padrão dos traces em memória: 10 minutos. */
const DEFAULT_TTL_MS = 10 * 60 * 1000;

interface Entry {
  trace: BackendTrace;
  at: number;
}

/**
 * Guarda os BackendTrace recebidos do node-agent, indexados por traceId, com
 * TTL curto (o rastro só interessa enquanto a seleção correspondente está
 * viva). A limpeza roda no insert — sem timers, sem estado de fundo.
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
