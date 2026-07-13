import type { ChatUsage, DaemonMessage, ModelOption, SkillOption } from '@eregion/protocol';

export interface PlanItem {
  text: string;
  status: 'pending' | 'in_progress' | 'completed';
}

export type JobStatus = 'queued' | 'running' | 'done' | 'failed';

export interface JobEvent {
  kind: 'tool' | 'edit' | 'error';
  name?: string;
  label: string;
  detail?: string;
  /** For edits: checkpoint id used to revert. */
  checkpointId?: string;
  status?: 'running' | 'done' | 'error';
}

/** A run of assistant prose, kept as its own ordered block. */
export interface TextBlock {
  kind: 'text';
  text: string;
}

/** The assistant's output as it arrived: prose and steps interleaved in order. */
export type TimelineBlock = TextBlock | JobEvent;

export interface Job {
  id: number;
  /** Thread root: replies share the first turn's rootId. */
  rootId: string;
  /** Correlates with daemon events (parallel session pool). */
  jobId: string;
  /** Dispatch epoch — feeds the card's live timer. */
  startedAt: number;
  prompt: string;
  /** Names of the components selected at dispatch (job chips). */
  targets: string[];
  status: JobStatus;
  /** Assistant output in arrival order: text runs and steps interleaved. */
  timeline: TimelineBlock[];
  usage?: ChatUsage;
  durationMs?: number;
  plan?: PlanItem[];
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
  skills: SkillOption[];
  /** Current dev choice; 'default' = account default model. */
  selectedModel: string;
  /** Auto-approve every tool action (Bash included) without a prompt. */
  autoApprove: boolean;
  /** Session-accumulated usage (drawer meter). */
  totals: { outputTokens: number; costUsd: number; jobs: number };
}

type Listener = (state: UiState) => void;

const STORAGE_KEY = 'eregion.jobs.v2';

/** Steps (tool/edit/error) are the non-text blocks of the timeline. */
export function jobSteps(job: Job): JobEvent[] {
  return job.timeline.filter((b): b is JobEvent => b.kind !== 'text');
}

/** Appends streamed text to the trailing text run, or opens a new one. */
function appendText(timeline: TimelineBlock[], text: string): TimelineBlock[] {
  const last = timeline[timeline.length - 1];
  if (last && last.kind === 'text') {
    return [...timeline.slice(0, -1), { kind: 'text', text: last.text + text }];
  }
  return [...timeline, { kind: 'text', text }];
}

interface Persisted {
  jobs: Job[];
  totals: UiState['totals'];
  autoApprove?: boolean;
}

function loadPersisted(): Persisted | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Persisted;
    // running jobs from a dead page can never finish — surface them as failed
    for (const job of data.jobs) {
      if (job.status === 'running' || job.status === 'queued') job.status = 'failed';
    }
    return data;
  } catch {
    return null;
  }
}

export class JobStore {
  private state: UiState = {
    jobs: [],
    permission: null,
    connected: false,
    models: [],
    skills: [],
    selectedModel: 'default',
    autoApprove: false,
    totals: { outputTokens: 0, costUsd: 0, jobs: 0 },
  };
  private listeners = new Set<Listener>();
  private nextJobId = 1;

  constructor() {
    if (typeof sessionStorage === 'undefined') return;
    const saved = loadPersisted();
    if (saved) {
      this.state = { ...this.state, jobs: saved.jobs, totals: saved.totals, autoApprove: saved.autoApprove ?? false };
      this.nextJobId = saved.jobs.reduce((max, j) => Math.max(max, j.id), 0) + 1;
    }
  }

  private persist(): void {
    if (typeof sessionStorage === 'undefined') return;
    try {
      const jobs = this.state.jobs.slice(-30);
      const data: Persisted = { jobs, totals: this.state.totals, autoApprove: this.state.autoApprove };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // storage full — history is a convenience, never an error
    }
  }

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
    if ('jobs' in patch || 'totals' in patch || 'autoApprove' in patch) this.persist();
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

  setAutoApprove(on: boolean): void {
    this.emit({ autoApprove: on });
  }

  dispatch(prompt: string, targets: string[], opts: { rootId?: string } = {}): Job {
    const id = this.nextJobId++;
    const chosen =
      this.state.selectedModel !== 'default'
        ? this.state.models.find((m) => m.id === this.state.selectedModel)
        : undefined;
    const jobId = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `job-${id}`;
    const job: Job = {
      id,
      jobId,
      rootId: opts.rootId ?? jobId,
      prompt,
      targets,
      status: 'queued',
      timeline: [],
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
        const { models, skills } = msg.payload;
        this.emit({
          connected: true,
          ...(models && models.length > 0 ? { models } : {}),
          ...(skills && skills.length > 0 ? { skills } : {}),
        });
        return;
      }
      case 'models.update':
        return this.emit({
          models: msg.payload.models,
          ...(msg.payload.skills && msg.payload.skills.length > 0 ? { skills: msg.payload.skills } : {}),
        });
      case 'chat.plan': {
        const idx = this.targetIndex(msg.payload.jobId);
        this.patchJob(idx, { plan: msg.payload.items });
        return;
      }
      case 'usage.update':
        return;
      case 'chat.delta': {
        const idx = this.targetIndex(msg.payload.jobId);
        this.patchJob(idx, (job) => ({ status: 'running', timeline: appendText(job.timeline, msg.payload.text) }));
        return;
      }
      case 'chat.tool': {
        const idx = this.targetIndex(msg.payload.jobId);
        this.patchJob(idx, (job) => {
          const timeline = [...job.timeline];
          for (let i = timeline.length - 1; i >= 0; i -= 1) {
            const b = timeline[i]!;
            if (b.kind === 'tool' && (b.name ?? b.label) === msg.payload.name && b.status === 'running') {
              timeline[i] = { ...b, label: msg.payload.label, status: msg.payload.status };
              return { status: 'running', timeline };
            }
          }
          timeline.push({ kind: 'tool', name: msg.payload.name, label: msg.payload.label, status: msg.payload.status });
          return { status: 'running', timeline };
        });
        return;
      }
      case 'edit.applied': {
        const idx = this.targetIndex(msg.payload.jobId);
        this.patchJob(idx, (job) => ({
          timeline: [
            ...job.timeline,
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
            timeline: [...job.timeline, { kind: 'error', label: msg.payload.code, detail: msg.payload.message }],
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
