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
    throw new Error('unknown checkpoint');
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
  it('reply pinned to a busy slot waits for that slot even with others idle', () => {
    const { pool, runtimes } = makePool(2);
    pool.dispatch({ jobId: 'a', text: 'first' });
    expect(pool.slotOf('a')).toBe(0);

    pool.dispatch({ jobId: 'a2', text: 'reply', requiredSlot: pool.slotOf('a') });
    expect(pool.pendingCount).toBe(1);
    expect(runtimes).toHaveLength(1);

    pool.dispatch({ jobId: 'b', text: 'other' });
    expect(runtimes).toHaveLength(2);
    expect(runtimes[1]!.sent).toEqual(['other']);

    runtimes[0]!.finishTurn();
    expect(runtimes[0]!.sent).toEqual(['first', 'reply']);
    expect(pool.pendingCount).toBe(0);
  });

  it('runs up to `size` jobs in parallel and queues the overflow', () => {
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

  it('stamps events with the jobId of the origin slot', () => {
    const { pool, runtimes, emitted } = makePool(2);
    pool.dispatch({ jobId: 'a', text: 'a' });
    pool.dispatch({ jobId: 'b', text: 'b' });

    runtimes[0]!.events.onDelta('response A');
    runtimes[1]!.events.onDelta('response B');
    runtimes[1]!.events.onEditApplied('src/x.tsx', '+x', 'ck1');

    expect(emitted).toMatchObject([
      { type: 'chat.delta', payload: { text: 'response A', jobId: 'a' } },
      { type: 'chat.delta', payload: { text: 'response B', jobId: 'b' } },
      { type: 'edit.applied', payload: { file: 'src/x.tsx', jobId: 'b' } },
    ]);
  });

  it('cancel removes a queued job without touching running ones', async () => {
    const { pool, runtimes } = makePool(1);
    pool.dispatch({ jobId: 'a', text: 'a' });
    pool.dispatch({ jobId: 'b', text: 'b' });
    await pool.cancel('b');
    expect(pool.pendingCount).toBe(0);
    runtimes[0]!.finishTurn();
    expect(runtimes[0]!.sent).toEqual(['a']); // b never ran
  });

  it('a stream dying mid-turn fails the job explicitly', () => {
    const { pool, runtimes, emitted } = makePool(1);
    pool.dispatch({ jobId: 'a', text: 'a' });
    runtimes[0]!.events.onStreamEnd?.();
    expect(emitted.some((m) => m.type === 'error' && m.payload.code === 'stream_ended' && m.payload.jobId === 'a')).toBe(
      true,
    );
    expect(pool.busyCount).toBe(0);
  });

  it('a stream dying with a job accepted in the internal queue restarts the session', () => {
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
    expect(pool.busyCount).toBe(1); // job stays alive
  });
});
