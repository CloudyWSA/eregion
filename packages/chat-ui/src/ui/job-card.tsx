import { useEffect, useState } from 'preact/hooks';
import type { Job, JobEvent, JobStatus } from '../store.js';
import { Markdown } from './markdown.js';

/**
 * Job em accordion: colapsado é uma linha compacta (dot, alvos, prompt,
 * meta); expandido mostra a "linha de forja" — spine na cor do metal da
 * sessão (cobre/aço) com um nó por passo — a resposta em markdown e as
 * métricas. Um job expandido por vez: históricos longos não se atropelam.
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

interface Props {
  job: Job;
  expanded: boolean;
  onToggle(): void;
  onRevert(id: string): void;
}

export function JobCard({ job, expanded, onToggle, onRevert }: Props) {
  const elapsed = useElapsed(job);
  const lane = laneOf(job);
  const edits = job.events.filter((e) => e.kind === 'edit').length;

  return (
    <article class={`eg-card eg-lane-${lane} ${expanded ? 'eg-card-open' : ''}`}>
      <button class="eg-card-head" onClick={onToggle} title={expanded ? 'Recolher' : 'Expandir'}>
        <span class={`eg-status-dot ${job.status}`} />
        <span class="eg-card-targets">
          {job.targets.slice(0, expanded ? undefined : 2).map((t, i) => (
            <span key={i} class="eg-chip">{t}</span>
          ))}
        </span>
        {!expanded && <span class="eg-card-prompt-inline">{job.prompt}</span>}
        <span class="eg-card-meta">
          {job.modelName ? `${job.modelName} · ` : ''}{STATUS_VERB[job.status]} · {elapsed}
          {!expanded && edits > 0 && ` · ✎${edits}`}
        </span>
      </button>

      {expanded && (
        <div class="eg-card-body">
          <h3 class="eg-card-prompt">{job.prompt}</h3>

          {job.events.length > 0 && (
            <div class="eg-steps">
              {job.events.map((ev, i) => (
                <Step key={i} ev={ev} onRevert={onRevert} />
              ))}
            </div>
          )}

          {job.answer && (
            <div class="eg-card-answer">
              <Markdown text={job.answer} />
              {job.status === 'running' && <span class="eg-cursor" />}
            </div>
          )}

          {job.usage && (
            <footer class="eg-card-foot">
              {job.usage.outputTokens} tok · {((job.durationMs ?? 0) / 1000).toFixed(1)}s
              {job.usage.costUsd !== undefined && ` · $${job.usage.costUsd.toFixed(3)}`}
            </footer>
          )}
        </div>
      )}
    </article>
  );
}
