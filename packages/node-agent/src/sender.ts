import { readDaemonInfo } from '@eregion/config';
import type { BackendTrace } from '@eregion/protocol';

/** Traces retidos quando o daemon está offline; descarta os mais antigos. */
const MAX_BUFFER = 50;

/**
 * Envia BackendTrace ao daemon via HTTP POST /trace/ingest (fetch nativo,
 * fire-and-forget). Se o daemon estiver offline, mantém um buffer limitado e
 * tenta reenviar no próximo send — nunca lança para o app instrumentado.
 */
export class TraceSender {
  private buffer: BackendTrace[] = [];

  constructor(private repoRoot: string) {}

  send(trace: BackendTrace): void {
    this.buffer.push(trace);
    if (this.buffer.length > MAX_BUFFER) this.buffer.splice(0, this.buffer.length - MAX_BUFFER);
    void this.flush();
  }

  /** Tenta drenar o buffer; falhas voltam para a fila (bounded). */
  async flush(): Promise<void> {
    const info = readDaemonInfo(this.repoRoot);
    if (!info) return; // daemon não está rodando — mantém no buffer
    const pending = this.buffer;
    this.buffer = [];
    const url = `http://127.0.0.1:${info.port}/trace/ingest`;
    for (const trace of pending) {
      try {
        await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(trace),
        });
      } catch {
        // offline no meio do flush — devolve o restante e para
        this.buffer.push(trace);
      }
    }
    if (this.buffer.length > MAX_BUFFER) this.buffer.splice(0, this.buffer.length - MAX_BUFFER);
  }
}
