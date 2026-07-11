import type { DaemonMessage } from '@eregion/protocol';
import type { AgentRuntime, RuntimeEvents } from './agent-runtime.js';

export interface PoolJob {
  jobId: string;
  text: string;
  /** Pin to a specific slot (conversation continuity for replies). */
  requiredSlot?: number;
  /** ModelOption id; absent = the account's default model. */
  model?: string;
}

interface Slot {
  index: number;
  runtime: AgentRuntime;
  currentJob: PoolJob | null;
}

export interface PoolOptions {
  /** Max live sessions in parallel (each pays for its own cache prefix). */
  size: number;
  /** Per-slot runtime factory — the pool injects events already correlated by job. */
  makeRuntime(slotIndex: number, events: RuntimeEvents): AgentRuntime;
  emit(msg: DaemonMessage): void;
}

/**
 * Pool of live sessions: jobs go to the first idle session (created on demand
 * up to `size`); with all busy, they enter a global FIFO queue. Each event is
 * stamped with the slot's jobId — that is what lets the UI show two jobs
 * progressing at once without mixing up the responses.
 */
export class RuntimePool {
  private slots: Slot[] = [];
  private pending: PoolJob[] = [];
  private jobSlots = new Map<string, number>();

  constructor(private options: PoolOptions) {}

  /** slot 0 sessionId (informational, for hello.ok). */
  get primarySessionId(): string | null {
    return this.slots[0]?.runtime.sessionId ?? null;
  }

  get busyCount(): number {
    return this.slots.filter((s) => s.currentJob !== null).length;
  }

  get pendingCount(): number {
    return this.pending.length;
  }

  slotOf(jobId: string): number | undefined {
    return this.jobSlots.get(jobId);
  }

  dispatch(job: PoolJob): void {
    if (job.requiredSlot !== undefined) {
      const slot = this.slots[job.requiredSlot];
      if (!slot) {
        delete job.requiredSlot;
      } else if (slot.currentJob === null) {
        this.run(slot, job);
        return;
      } else {
        this.pending.push(job);
        return;
      }
    }
    const slot = this.idleSlot();
    if (slot) this.run(slot, job);
    else this.pending.push(job);
  }

  /** Cancels a specific job (queued or running) or, without jobId, everything. */
  async cancel(jobId?: string): Promise<void> {
    if (jobId === undefined) {
      this.pending.length = 0;
      await Promise.all(this.slots.map((s) => s.runtime.interrupt().catch(() => undefined)));
      return;
    }
    const queued = this.pending.findIndex((j) => j.jobId === jobId);
    if (queued >= 0) {
      this.pending.splice(queued, 1);
      return;
    }
    const slot = this.slots.find((s) => s.currentJob?.jobId === jobId);
    if (slot) await slot.runtime.interrupt().catch(() => undefined);
  }

  /**
   * The checkpoint belongs to the session that made the edit; with no origin
   * record, try each slot — rewind with an unknown id fails harmlessly.
   */
  async rewindFiles(checkpointId: string): Promise<void> {
    let lastError: Error | null = null;
    for (const slot of this.slots) {
      try {
        await slot.runtime.rewindFiles(checkpointId);
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }
    throw lastError ?? new Error('no active session to revert');
  }

  async close(): Promise<void> {
    this.pending.length = 0;
    await Promise.all(this.slots.map((s) => s.runtime.close()));
  }

  private idleSlot(): Slot | null {
    const idle = this.slots.find((s) => s.currentJob === null);
    if (idle) return idle;
    if (this.slots.length < this.options.size) return this.createSlot();
    return null;
  }

  private createSlot(): Slot {
    const index = this.slots.length;
    const slot: Slot = { index, runtime: null as unknown as AgentRuntime, currentJob: null };
    const jobId = () => slot.currentJob?.jobId;
    const emit = this.options.emit;
    const events: RuntimeEvents = {
      onSessionInit: () => undefined, // persistence is makeRuntime's responsibility
      onDelta: (text) => emit({ type: 'chat.delta', payload: { text, jobId: jobId() } }),
      onToolUse: (name, label, status) => emit({ type: 'chat.tool', payload: { name, label, status, jobId: jobId() } }),
      onResult: (usage, durationMs) => {
        emit({ type: 'chat.result', payload: { usage, durationMs, jobId: jobId() } });
        this.finish(slot);
      },
      onEditApplied: (file, diff, checkpointId) =>
        emit({ type: 'edit.applied', payload: { file, diff, checkpointId, jobId: jobId() } }),
      onStatus: (state) => emit({ type: 'status', payload: { state } }),
      onError: (code, message) => {
        emit({ type: 'error', payload: { code, message, jobId: jobId() } });
        this.finish(slot);
      },
      onStreamEnd: () => {
        if (!slot.currentJob) return;
        if (slot.runtime.pendingMessages > 0) {
          // The next job was already accepted when the stream died (maxTurns):
          // resume the session and the job continues where it left off.
          slot.runtime.ensureStarted();
          return;
        }
        // Job died mid-turn with no result — fail explicitly, no hang.
        emit({
          type: 'error',
          payload: {
            code: 'stream_ended',
            message: 'The session ended before finishing the request.',
            jobId: jobId(),
          },
        });
        this.finish(slot);
      },
    };
    slot.runtime = this.options.makeRuntime(index, events);
    this.slots.push(slot);
    return slot;
  }

  private run(slot: Slot, job: PoolJob): void {
    slot.currentJob = job;
    this.jobSlots.set(job.jobId, slot.index);
    if (this.jobSlots.size > 200) {
      const oldest = this.jobSlots.keys().next().value;
      if (oldest !== undefined) this.jobSlots.delete(oldest);
    }
    slot.runtime.sendMessage(job.text, job.model);
  }

  private finish(slot: Slot): void {
    if (!slot.currentJob) return;
    slot.currentJob = null;
    const idx = this.pending.findIndex((j) => j.requiredSlot === undefined || j.requiredSlot === slot.index);
    if (idx >= 0) {
      const [next] = this.pending.splice(idx, 1);
      this.run(slot, next!);
    }
  }
}
