import type { DaemonMessage } from '@eregion/protocol';
import { describe, expect, it } from 'vitest';
import type { AgentRuntime, RuntimeEvents } from './agent-runtime.js';
import { RuntimePool } from './runtime-pool.js';

const usage = { inputTokens: 1, outputTokens: 2, cacheReadTokens: 3 };

class FakeRuntime {
  sessionId: string | null = null;
  pendingMessages = 0;
  sent: string[] = [];
  constructor(public events: RuntimeEvents) {}
  sendMessage(text: string): void {
    this.sent.push(text);
  }
  finishTurn(): void {
    this.events.onResult(usage, 100);
  }
  async interrupt(): Promise<void> {}
  async rewindFiles(): Promise<void> {
    throw new Error('checkpoint desconhecido');
  }
  async close(): Promise<void> {}
  ensureStarted(): void {}
}

function makePool(size: number) {
  const runtimes: FakeRuntime[] = [];
  const emitted: DaemonMessage[] = [];
  const pool = new RuntimePool({
    size,
    emit: (msg) => emitted.push(msg),
    makeRuntime: (_i, events) => {
      const rt = new FakeRuntime(events);
      runtimes.push(rt);
      return rt as unknown as AgentRuntime;
    },
  });
  return { pool, runtimes, emitted };
}

describe('RuntimePool', () => {
  it('roda até `size` jobs em paralelo e enfileira o excedente', () => {
    const { pool, runtimes } = makePool(2);
    pool.dispatch({ jobId: 'a', text: 'job a' });
    pool.dispatch({ jobId: 'b', text: 'job b' });
    pool.dispatch({ jobId: 'c', text: 'job c' });

    expect(runtimes).toHaveLength(2);
    expect(runtimes[0]!.sent).toEqual(['job a']);
    expect(runtimes[1]!.sent).toEqual(['job b']);
    expect(pool.pendingCount).toBe(1);

    runtimes[0]!.finishTurn();
    expect(runtimes[0]!.sent).toEqual(['job a', 'job c']);
    expect(pool.pendingCount).toBe(0);
  });

  it('carimba os eventos com o jobId do slot de origem', () => {
    const { pool, runtimes, emitted } = makePool(2);
    pool.dispatch({ jobId: 'a', text: 'a' });
    pool.dispatch({ jobId: 'b', text: 'b' });

    runtimes[0]!.events.onDelta('resposta A');
    runtimes[1]!.events.onDelta('resposta B');
    runtimes[1]!.events.onEditApplied('src/x.tsx', '+x', 'ck1');

    expect(emitted).toMatchObject([
      { type: 'chat.delta', payload: { text: 'resposta A', jobId: 'a' } },
      { type: 'chat.delta', payload: { text: 'resposta B', jobId: 'b' } },
      { type: 'edit.applied', payload: { file: 'src/x.tsx', jobId: 'b' } },
    ]);
  });

  it('cancel remove job da fila sem tocar nos que rodam', async () => {
    const { pool, runtimes } = makePool(1);
    pool.dispatch({ jobId: 'a', text: 'a' });
    pool.dispatch({ jobId: 'b', text: 'b' });
    await pool.cancel('b');
    expect(pool.pendingCount).toBe(0);
    runtimes[0]!.finishTurn();
    expect(runtimes[0]!.sent).toEqual(['a']); // b nunca rodou
  });

  it('stream morrendo no meio do turn falha o job explicitamente', () => {
    const { pool, runtimes, emitted } = makePool(1);
    pool.dispatch({ jobId: 'a', text: 'a' });
    runtimes[0]!.events.onStreamEnd?.();
    expect(emitted.some((m) => m.type === 'error' && m.payload.code === 'stream_ended' && m.payload.jobId === 'a')).toBe(
      true,
    );
    expect(pool.busyCount).toBe(0);
  });

  it('stream morrendo com job aceito na fila interna religa a sessão', () => {
    const { pool, runtimes } = makePool(1);
    let restarted = false;
    pool.dispatch({ jobId: 'a', text: 'a' });
    const rt = runtimes[0]!;
    rt.pendingMessages = 1;
    rt.ensureStarted = () => {
      restarted = true;
    };
    rt.events.onStreamEnd?.();
    expect(restarted).toBe(true);
    expect(pool.busyCount).toBe(1); // job continua vivo
  });
});
