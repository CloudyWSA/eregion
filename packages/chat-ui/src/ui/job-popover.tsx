import { Fragment, type ComponentChild } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { Job, JobEvent, JobStatus, TimelineBlock } from '../store.js';
import { jobSteps } from '../store.js';
import { Anchored, type AnchorTarget } from './anchored.js';
import { DiffView } from './diff.js';
import { Markdown } from './markdown.js';

const STATUS_VERB: Record<JobStatus, string> = {
  queued: 'queued',
  running: 'working',
  done: 'done',
  failed: 'failed',
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
          edited <FileRef file={ev.label} />
        </button>
        {ev.checkpointId && (
          <button class="eg-revert" onClick={() => onRevert(ev.checkpointId!)}>revert</button>
        )}
        {showDiff && ev.detail && (
          <div class="eg-step-diff">
            <DiffView diff={ev.detail} file={ev.label} />
          </div>
        )}
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

/** Renders the timeline in order: text runs as prose, consecutive steps grouped. */
function Timeline({ blocks, onRevert }: { blocks: TimelineBlock[]; onRevert(id: string): void }) {
  const out: ComponentChild[] = [];
  let steps: JobEvent[] = [];
  const flush = () => {
    if (steps.length === 0) return;
    const group = steps;
    steps = [];
    out.push(
      <div class="eg-steps" key={`s${out.length}`}>
        {group.map((ev, i) => (
          <Step key={i} ev={ev} onRevert={onRevert} />
        ))}
      </div>,
    );
  };
  for (const block of blocks) {
    if (block.kind === 'text') {
      flush();
      if (block.text.trim()) out.push(<Markdown key={`t${out.length}`} text={block.text} />);
    } else {
      steps.push(block);
    }
  }
  flush();
  return <Fragment>{out}</Fragment>;
}

interface Props {
  thread: Job[];
  anchor: AnchorTarget;
  onClose(): void;
  onRevert(id: string): void;
  onReply(text: string): void;
}

export function JobPopover({ thread, anchor, onClose, onRevert, onReply }: Props) {
  const first = thread[0]!;
  const last = thread[thread.length - 1]!;
  const elapsed = useElapsed(last);
  const [reply, setReply] = useState('');
  const busy = last.status === 'running' || last.status === 'queued';

  const sendReply = () => {
    const text = reply.trim();
    if (!text) return;
    setReply('');
    onReply(text);
  };

  return (
    <Anchored anchor={anchor} estimatedHeight={220}>
      <div class="eg-job">
        <header class="eg-job-head eg-drag">
          <span class={`eg-dot ${last.status}`} />
          <span class="eg-job-title">{first.prompt}</span>
          <span class="eg-job-meta">
            {last.modelName ? `${last.modelName} · ` : ''}{STATUS_VERB[last.status]} · {elapsed}
          </span>
          <button class="eg-x" onClick={onClose} title="Close (the request keeps running)">✕</button>
        </header>
        <div class="eg-job-body">
          {last.plan && last.plan.length > 0 && (
            <div class="eg-plan">
              {last.plan.map((item, i) => (
                <div key={i} class={`eg-plan-item eg-plan-${item.status}`}>
                  <span class="eg-plan-mark">
                    {item.status === 'completed' ? '●' : item.status === 'in_progress' ? '◐' : '○'}
                  </span>
                  {item.text}
                </div>
              ))}
            </div>
          )}
          {thread.map((turn, ti) => (
            <Fragment key={turn.jobId}>
              {ti > 0 && <div class="eg-turn-prompt">{turn.prompt}</div>}
              <Timeline blocks={turn.timeline} onRevert={onRevert} />
            </Fragment>
          ))}
        </div>
        <footer class="eg-foot">
          {last.status === 'done' && thread.some((t) => jobSteps(t).some((e) => e.kind === 'edit')) && (
            <button
              class="eg-commit"
              title="Ask the assistant to commit this job's changes"
              onClick={() => onReply('Commit the changes from this request as one atomic commit with a good message. Nothing else.')}
            >
              commit
            </button>
          )}
          <input
            class="eg-reply"
            value={reply}
            placeholder={busy ? 'Reply (queues on this session)…' : 'Reply…'}
            onInput={(e) => setReply((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') sendReply();
              e.stopPropagation();
            }}
          />
          {last.usage && (
            <span class="eg-foot-metrics">
              {last.usage.outputTokens} tok
              {last.usage.costUsd !== undefined && ` · $${last.usage.costUsd.toFixed(3)}`}
            </span>
          )}
        </footer>
      </div>
    </Anchored>
  );
}
