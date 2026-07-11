import { readDaemonInfo } from '@eregion/config';
import type { BackendTrace } from '@eregion/protocol';

/** Traces held while the daemon is offline; drops the oldest. */
const MAX_BUFFER = 50;

/**
 * Sends BackendTrace to the daemon via HTTP POST /trace/ingest (native fetch,
 * fire-and-forget). When the daemon is offline, keeps a bounded buffer and
 * retries on the next send — never throws to the instrumented app.
 */
export class TraceSender {
  private buffer: BackendTrace[] = [];

  constructor(private repoRoot: string) {}

  send(trace: BackendTrace): void {
    this.buffer.push(trace);
    if (this.buffer.length > MAX_BUFFER) this.buffer.splice(0, this.buffer.length - MAX_BUFFER);
    void this.flush();
  }

  /** Tries to drain the buffer; failures go back to the queue (bounded). */
  async flush(): Promise<void> {
    const info = readDaemonInfo(this.repoRoot);
    if (!info) return; // daemon not running — keep in the buffer
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
        // offline mid-flush — put it back and stop
        this.buffer.push(trace);
      }
    }
    if (this.buffer.length > MAX_BUFFER) this.buffer.splice(0, this.buffer.length - MAX_BUFFER);
  }
}
