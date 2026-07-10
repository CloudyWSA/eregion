import type { DaemonMessage } from '@eregion/protocol';
import type { AgentRuntime, RuntimeEvents } from './agent-runtime.js';

export interface PoolJob {
  jobId: string;
  text: string;
  /** id de ModelOption; ausente = modelo default da conta. */
  model?: string;
}

interface Slot {
  index: number;
  runtime: AgentRuntime;
  currentJob: PoolJob | null;
}

export interface PoolOptions {
  /** Máximo de sessões vivas em paralelo (cada uma paga o próprio prefixo de cache). */
  size: number;
  /** Fábrica de runtime por slot — o pool injeta os eventos já correlacionados por job. */
  makeRuntime(slotIndex: number, events: RuntimeEvents): AgentRuntime;
  emit(msg: DaemonMessage): void;
}

/**
 * Pool de sessões vivas: jobs vão para a primeira sessão ociosa (criada sob
 * demanda até `size`); com todas ocupadas, entram numa fila global FIFO.
 * Cada evento sai carimbado com o jobId do slot — é isso que permite a UI
 * mostrar dois jobs progredindo ao mesmo tempo sem misturar as respostas.
 */
export class RuntimePool {
  private slots: Slot[] = [];
  private pending: PoolJob[] = [];

  constructor(private options: PoolOptions) {}

  /** sessionId do slot 0 (informativo, para o hello.ok). */
  get primarySessionId(): string | null {
    return this.slots[0]?.runtime.sessionId ?? null;
  }

  get busyCount(): number {
    return this.slots.filter((s) => s.currentJob !== null).length;
  }

  get pendingCount(): number {
    return this.pending.length;
  }

  dispatch(job: PoolJob): void {
    const slot = this.idleSlot();
    if (slot) this.run(slot, job);
    else this.pending.push(job);
  }

  /** Cancela um job específico (fila ou em execução) ou, sem jobId, tudo. */
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
   * O checkpoint pertence à sessão que fez a edição; sem registro de origem,
   * tenta cada slot — rewind com id desconhecido falha sem efeito colateral.
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
    throw lastError ?? new Error('nenhuma sessão ativa para reverter');
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
      onSessionInit: () => undefined, // persistência é responsabilidade do makeRuntime
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
          // O job seguinte já estava aceito quando o stream morreu (maxTurns):
          // religa a sessão via resume e o job continua de onde estava.
          slot.runtime.ensureStarted();
          return;
        }
        // Job morreu no meio do turn, sem result — falha explícita, sem hang.
        emit({
          type: 'error',
          payload: {
            code: 'stream_ended',
            message: 'A sessão terminou antes de concluir o pedido.',
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
    slot.runtime.sendMessage(job.text, job.model);
  }

  private finish(slot: Slot): void {
    if (!slot.currentJob) return;
    slot.currentJob = null;
    const next = this.pending.shift();
    if (next) this.run(slot, next);
  }
}
