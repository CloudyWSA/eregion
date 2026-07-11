import type { ChatUsage, DaemonMessage, ModelOption } from '@eregion/protocol';

export type JobStatus = 'queued' | 'running' | 'done' | 'failed';

export interface JobEvent {
  kind: 'tool' | 'edit' | 'error';
  label: string;
  detail?: string;
  /** For edits: checkpoint id used to revert. */
  checkpointId?: string;
  status?: 'running' | 'done' | 'error';
}

export interface Job {
  id: number;
  /** Correlates with daemon events (parallel session pool). */
  jobId: string;
  /** Dispatch epoch — feeds the card's live timer. */
  startedAt: number;
  prompt: string;
  /** Names of the components selected at dispatch (job chips). */
  targets: string[];
  status: JobStatus;
  answer: string;
  events: JobEvent[];
  usage?: ChatUsage;
  durationMs?: number;
  /** id/name of the model chosen at dispatch (absent = account default). */
  model?: string;
  modelName?: string;
}

export interface PendingPermission {
  requestId: string;
  toolName: string;
  summary: string;
  diff?: string;
}

export interface UiState {
  jobs: Job[];
  permission: PendingPermission | null;
  connected: boolean;
  /** Models allowed by the account (discovered by the daemon at runtime). */
  models: ModelOption[];
  /** Current dev choice; 'default' = account default model. */
  selectedModel: string;
  /** Session-accumulated usage (drawer meter). */
  totals: { outputTokens: number; costUsd: number; jobs: number };
}

type Listener = (state: UiState) => void;

export class JobStore {
  private state: UiState = {
    jobs: [],
    permission: null,
    connected: false,
    models: [],
    selectedModel: 'default',
    totals: { outputTokens: 0, costUsd: 0, jobs: 0 },
  };
  private listeners = new Set<Listener>();
  private nextJobId = 1;

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  getState(): UiState {
    return this.state;
  }

  private emit(patch: Partial<UiState>): void {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn(this.state);
  }

  // Owning job for an event: by jobId when stamped (parallel pool); without
  // jobId, FIFO oldest open job (single-session compat).
  private targetIndex(jobId?: string): number {
    if (jobId !== undefined) return this.state.jobs.findIndex((j) => j.jobId === jobId);
    return this.state.jobs.findIndex((j) => j.status === 'queued' || j.status === 'running');
  }

  private patchJob(index: number, patch: Partial<Job> | ((job: Job) => Partial<Job>)): void {
    if (index < 0) return;
    const jobs = [...this.state.jobs];
    const job = jobs[index]!;
    jobs[index] = { ...job, ...(typeof patch === 'function' ? patch(job) : patch) };
    this.emit({ jobs });
  }

  setSelectedModel(id: string): void {
    this.emit({ selectedModel: id });
  }

  dispatch(prompt: string, targets: string[]): Job {
    const id = this.nextJobId++;
    const chosen =
      this.state.selectedModel !== 'default'
        ? this.state.models.find((m) => m.id === this.state.selectedModel)
        : undefined;
    const job: Job = {
      id,
      jobId: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `job-${id}`,
      prompt,
      targets,
      status: 'queued',
      answer: '',
      events: [],
      startedAt: Date.now(),
      model: chosen?.id,
      modelName: chosen?.name,
    };
    this.emit({ jobs: [...this.state.jobs, job] });
    return job;
  }

  setConnected(connected: boolean): void {
    this.emit({ connected });
  }

  permissionResolved(): void {
    this.emit({ permission: null });
  }

  handle(msg: DaemonMessage): void {
    switch (msg.type) {
      case 'hello.ok': {
        const models = msg.payload.models;
        this.emit({ connected: true, ...(models && models.length > 0 ? { models } : {}) });
        return;
      }
      case 'models.update':
        return this.emit({ models: msg.payload.models });
      case 'chat.delta': {
        const idx = this.targetIndex(msg.payload.jobId);
        this.patchJob(idx, (job) => ({ status: 'running', answer: job.answer + msg.payload.text }));
        return;
      }
      case 'chat.tool': {
        const idx = this.targetIndex(msg.payload.jobId);
        this.patchJob(idx, (job) => {
          const events = [...job.events];
          let found = false;
          for (let i = events.length - 1; i >= 0; i -= 1) {
            const ev = events[i]!;
            if (ev.kind === 'tool' && ev.label === msg.payload.label && ev.status === 'running') {
              events[i] = { ...ev, status: msg.payload.status };
              found = true;
              break;
            }
          }
          if (!found) events.push({ kind: 'tool', label: msg.payload.label, status: msg.payload.status });
          return { status: 'running', events };
        });
        return;
      }
      case 'edit.applied': {
        const idx = this.targetIndex(msg.payload.jobId);
        this.patchJob(idx, (job) => ({
          events: [
            ...job.events,
            { kind: 'edit', label: msg.payload.file, detail: msg.payload.diff, checkpointId: msg.payload.checkpointId },
          ],
        }));
        return;
      }
      case 'chat.result': {
        const idx = this.targetIndex(msg.payload.jobId);
        this.patchJob(idx, { status: 'done', usage: msg.payload.usage, durationMs: msg.payload.durationMs });
        const t = this.state.totals;
        this.emit({
          totals: {
            outputTokens: t.outputTokens + msg.payload.usage.outputTokens,
            costUsd: t.costUsd + (msg.payload.usage.costUsd ?? 0),
            jobs: t.jobs + 1,
          },
        });
        return;
      }
      case 'permission.request':
        return this.emit({ permission: msg.payload });
      case 'error': {
        const idx = this.targetIndex(msg.payload.jobId);
        if (idx >= 0) {
          this.patchJob(idx, (job) => ({
            status: 'failed',
            events: [...job.events, { kind: 'error', label: msg.payload.code, detail: msg.payload.message }],
          }));
        }
        return;
      }
      case 'hello.error': {
        this.emit({ connected: false });
        return;
      }
      case 'status':
      case 'angular.index':
        return;
      default:
        return;
    }
  }
}
