import { useEffect, useRef, useState } from 'preact/hooks';
import type { JobStatus, UiState } from '../store.js';
import { JobCard, laneOf } from './job-card.js';

export interface ActivityCallbacks {
  onRevert(checkpointId: string): void;
  onPermission(requestId: string, allow: boolean): void;
  onFreeChat(text: string): void;
}

const PILL_STATE: Record<JobStatus, { text: string; cls: string }> = {
  queued: { text: 'na fila', cls: '' },
  running: { text: 'forjando', cls: 'run' },
  done: { text: 'pronto', cls: 'ok' },
  failed: { text: 'falhou', cls: 'err' },
};

export function Activity({ state, callbacks }: { state: UiState; callbacks: ActivityCallbacks }) {
  const [openDrawer, setOpenDrawer] = useState(false);
  const [freeText, setFreeText] = useState('');
  // Accordion: um job expandido por vez; job novo rouba o foco (auto-follow).
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const lastSeen = useRef(0);
  useEffect(() => {
    const newest = state.jobs[state.jobs.length - 1];
    if (newest && newest.id > lastSeen.current) {
      lastSeen.current = newest.id;
      setExpandedId(newest.id);
    }
  }, [state.jobs]);
  const active = state.jobs.filter((j) => j.status === 'queued' || j.status === 'running');
  const recentDone = state.jobs.filter((j) => j.status === 'done' || j.status === 'failed').slice(-2);

  const sendFree = () => {
    const text = freeText.trim();
    if (!text) return;
    setFreeText('');
    callbacks.onFreeChat(text);
  };

  return (
    <>
      {!openDrawer && (active.length > 0 || recentDone.length > 0) && (
        <div class="eg-rail">
          {[...recentDone, ...active].map((job) => (
            <button key={job.id} class={`eg-pill eg-lane-${laneOf(job)}`} onClick={() => setOpenDrawer(true)}>
              <span class={`eg-pill-state ${PILL_STATE[job.status].cls}`}>{PILL_STATE[job.status].text}</span>
              <span class="eg-pill-prompt">{job.prompt}</span>
            </button>
          ))}
        </div>
      )}

      {openDrawer && (
        <div class="eg-drawer">
          <div class="eg-drawer-head">
            <span class="eg-drawer-title"><b>⟡</b> eregion</span>
            <button class="eg-close" onClick={() => setOpenDrawer(false)}>✕</button>
          </div>
          <div class="eg-jobs">
            {state.jobs.length === 0 ? (
              <div class="eg-empty">
                Selecione componentes com <kbd>alt</kbd>+<kbd>s</kbd> e descreva a mudança na barra.
              </div>
            ) : (
              state.jobs.map((job) => (
                <JobCard
                  key={job.id}
                  job={job}
                  expanded={expandedId === job.id}
                  onToggle={() => setExpandedId(expandedId === job.id ? null : job.id)}
                  onRevert={callbacks.onRevert}
                />
              ))
            )}
          </div>
          <div class="eg-drawer-foot">
            <div class="eg-meter">
              <span>{state.totals.jobs} {state.totals.jobs === 1 ? 'pedido' : 'pedidos'} nesta sessão</span>
              <span>
                {state.totals.outputTokens} tok{state.totals.costUsd > 0 && ` · $${state.totals.costUsd.toFixed(3)}`}
              </span>
            </div>
            <div class="eg-free">
              <input
                class="eg-free-input"
                value={freeText}
                placeholder="Perguntar sem seleção…"
                onInput={(e) => setFreeText((e.target as HTMLInputElement).value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') sendFree();
                  e.stopPropagation();
                }}
              />
              <button class="eg-send" onClick={sendFree}>enviar</button>
            </div>
          </div>
        </div>
      )}

      {state.permission && (
        <div class="eg-scrim">
          <div class="eg-modal">
            <div class="eg-modal-title">
              Permitir <b>{state.permission.toolName}</b>?
            </div>
            <div class="eg-modal-cmd">{state.permission.summary}</div>
            {state.permission.diff && <div class="eg-modal-diff">{state.permission.diff}</div>}
            <div class="eg-modal-actions">
              <button class="eg-act-deny" onClick={() => callbacks.onPermission(state.permission!.requestId, false)}>
                Negar
              </button>
              <button class="eg-act-allow" onClick={() => callbacks.onPermission(state.permission!.requestId, true)}>
                Permitir
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
