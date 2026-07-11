import { useEffect, useState } from 'preact/hooks';
import type { Job, JobEvent, JobStatus } from '../store.js';
import { Anchored, type AnchorTarget } from './anchored.js';
import { Markdown } from './markdown.js';

const STATUS_VERB: Record<JobStatus, string> = {
  queued: 'na fila',
  running: 'trabalhando',
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
  anchor: AnchorTarget;
  onClose(): void;
  onRevert(id: string): void;
}

/** O resultado mora onde o pedido nasceu: popover no componente, não sidebar. */
export function JobPopover({ job, anchor, onClose, onRevert }: Props) {
  const elapsed = useElapsed(job);
  return (
    <Anchored anchor={anchor} estimatedHeight={220}>
      <div class="eg-job">
        <header class="eg-job-head eg-drag">
          <span class={`eg-dot ${job.status}`} />
          <span class="eg-job-title">{job.prompt}</span>
          <span class="eg-job-meta">
            {job.modelName ? `${job.modelName} · ` : ''}{STATUS_VERB[job.status]} · {elapsed}
          </span>
          <button class="eg-x" onClick={onClose} title="Fechar (o pedido continua)">✕</button>
        </header>
        {(job.events.length > 0 || job.answer) && (
          <div class="eg-job-body">
            {job.events.length > 0 && (
              <div class="eg-steps">
                {job.events.map((ev, i) => (
                  <Step key={i} ev={ev} onRevert={onRevert} />
                ))}
              </div>
            )}
            {job.answer && <Markdown text={job.answer} />}
          </div>
        )}
        {job.usage && (
          <footer class="eg-foot">
            <span>{job.usage.outputTokens} tok · {((job.durationMs ?? 0) / 1000).toFixed(1)}s</span>
            {job.usage.costUsd !== undefined && <span>${job.usage.costUsd.toFixed(3)}</span>}
          </footer>
        )}
      </div>
    </Anchored>
  );
}
