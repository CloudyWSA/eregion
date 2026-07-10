import { useEffect, useState } from 'preact/hooks';
import type { Job, JobEvent, JobStatus } from '../store.js';

/**
 * Card de job com a "linha de forja": um spine vertical na cor do metal da
 * sessão (cobre/aço alternados entre jobs paralelos) com um nó por passo.
 * O nó do passo corrente pulsa (metal quente); passos prontos esfriam.
 */

export const LANES = ['copper', 'steel'] as const;

export function laneOf(job: Job): (typeof LANES)[number] {
  return LANES[job.id % LANES.length]!;
}

const STATUS_VERB: Record<JobStatus, string> = {
  queued: 'na fila',
  running: 'forjando',
  done: 'pronto',
  failed: 'falhou',
};

function useElapsed(job: Job): string {
  const running = job.status === 'running' || job.status === 'queued';
  const [, tick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [running]);
  const ms = job.durationMs ?? Date.now() - job.startedAt;
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}`;
}

function FileRef({ file }: { file: string }) {
  const cut = file.lastIndexOf('/') + 1;
  return (
    <span class="eg-file">
      <span class="dim">{file.slice(0, cut)}</span>
      {file.slice(cut)}
    </span>
  );
}

function Step({ ev, onRevert }: { ev: JobEvent; onRevert(id: string): void }) {
  const [showDiff, setShowDiff] = useState(false);
  if (ev.kind === 'edit') {
    return (
      <div class="eg-step eg-step-edit">
        <span class="eg-node eg-node-edit" />
        <button class="eg-step-label eg-step-btn" onClick={() => setShowDiff(!showDiff)}>
          editou <FileRef file={ev.label} />
        </button>
        {ev.checkpointId && (
          <button class="eg-revert" onClick={() => onRevert(ev.checkpointId!)}>reverter</button>
        )}
        {showDiff && ev.detail && <div class="eg-step-diff">{ev.detail}</div>}
      </div>
    );
  }
  if (ev.kind === 'error') {
    return (
      <div class="eg-step eg-step-err">
        <span class="eg-node eg-node-err" />
        <span class="eg-step-label">{ev.label}{ev.detail ? ` — ${ev.detail}` : ''}</span>
      </div>
    );
  }
  const running = ev.status === 'running';
  return (
    <div class={`eg-step ${running ? 'eg-step-hot' : ''}`}>
      <span class={`eg-node ${running ? 'eg-node-hot' : ''}`} />
      <span class="eg-step-label">{ev.label}{running && <span class="eg-ellipsis" />}</span>
    </div>
  );
}

export function JobCard({ job, onRevert }: { job: Job; onRevert(id: string): void }) {
  const elapsed = useElapsed(job);
  const open = job.status === 'running' || job.status === 'queued';
  const [expanded, setExpanded] = useState<boolean | null>(null);
  const showSteps = expanded ?? open;
  const edits = job.events.filter((e) => e.kind === 'edit').length;
  const lane = laneOf(job);

  return (
    <article class={`eg-card eg-lane-${lane}`}>
      <header class="eg-card-head">
        <span class={`eg-status-dot ${job.status}`} />
        <span class="eg-card-targets">
          {job.targets.map((t, i) => (
            <span key={i} class="eg-chip">{t}</span>
          ))}
        </span>
        <span class="eg-card-meta">
          {job.modelName ? `${job.modelName} · ` : ''}{STATUS_VERB[job.status]} · {elapsed}
        </span>
      </header>

      <h3 class="eg-card-prompt">{job.prompt}</h3>

      {job.events.length > 0 && !showSteps && (
        <button class="eg-steps-summary" onClick={() => setExpanded(true)}>
          {job.events.length} {job.events.length === 1 ? 'passo' : 'passos'}
          {edits > 0 && ` · ${edits} ${edits === 1 ? 'edição' : 'edições'}`} ▸
        </button>
      )}

      {job.events.length > 0 && showSteps && (
        <div class="eg-steps">
          {job.events.map((ev, i) => (
            <Step key={i} ev={ev} onRevert={onRevert} />
          ))}
          {!open && (
            <button class="eg-steps-summary" onClick={() => setExpanded(false)}>recolher ▴</button>
          )}
        </div>
      )}

      {job.answer && (
        <p class="eg-card-answer">
          {job.answer}
          {job.status === 'running' && <span class="eg-cursor" />}
        </p>
      )}

      {job.usage && (
        <footer class="eg-card-foot">
          {job.usage.outputTokens} tok · {((job.durationMs ?? 0) / 1000).toFixed(1)}s
          {job.usage.costUsd !== undefined && ` · $${job.usage.costUsd.toFixed(3)}`}
        </footer>
      )}
    </article>
  );
}
