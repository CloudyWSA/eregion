export const TOKENS = `
  --eg-srf: #fbfbfc;
  --eg-srf-2: #f2f2f5;
  --eg-ink: #1d1d22;
  --eg-line: #e4e4e9;
  --eg-muted: #73737d;
  --eg-accent: #a8622f;
  --eg-accent-soft: #a8622f22;
  --eg-ok: #4e7a5a;
  --eg-err: #ad554b;
  --eg-radius: 4px;
  --eg-shadow: 0 6px 24px rgba(24, 24, 28, 0.14), 0 0 0 1px var(--eg-line);
  --eg-prose: 12.5px/1.55 system-ui, sans-serif;
  --eg-mono: 11px/1.6 ui-monospace, 'Cascadia Mono', 'SF Mono', monospace;
`;

export const CHAT_CSS = `
:host { all: initial; ${TOKENS} }
* { box-sizing: border-box; }
button { all: unset; cursor: pointer; }
button:focus-visible { outline: 1px solid var(--eg-accent); outline-offset: 1px; border-radius: 3px; }
@media (prefers-reduced-motion: reduce) {
  * { animation: none !important; transition: none !important; }
}

/* ---- anchored popover ---- */
.eg-pop {
  position: fixed;
  z-index: 2147483647;
  width: min(400px, calc(100vw - 24px));
  background: var(--eg-srf);
  color: var(--eg-ink);
  border-radius: var(--eg-radius);
  box-shadow: var(--eg-shadow);
  font: var(--eg-mono);
  animation: eg-pop-in 100ms ease-out;
}
@keyframes eg-pop-in {
  from { opacity: 0; transform: scale(0.96); }
  to { opacity: 1; transform: scale(1); }
}
.eg-pop[data-place='above'] { transform-origin: bottom center; }
.eg-pop[data-place='below'] { transform-origin: top center; }
.eg-notch {
  position: absolute;
  left: 22px;
  width: 8px;
  height: 8px;
  background: var(--eg-accent);
  transform: rotate(45deg);
}
.eg-pop[data-place='below'] .eg-notch { top: -4px; }
.eg-pop[data-place='above'] .eg-notch { bottom: -4px; }
/* dragged = free window: the notch disappears */
.eg-pop[data-detached] .eg-notch { display: none; }
.eg-drag { cursor: grab; user-select: none; }
.eg-drag:active { cursor: grabbing; }
.eg-resize {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 14px;
  height: 14px;
  cursor: nwse-resize;
  background:
    linear-gradient(135deg, transparent 6px, var(--eg-line) 6px, var(--eg-line) 7px, transparent 7px),
    linear-gradient(135deg, transparent 9px, var(--eg-line) 9px, var(--eg-line) 10px, transparent 10px);
}
.eg-pop[data-sized] { display: flex; flex-direction: column; }
.eg-pop[data-sized] .eg-job { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.eg-pop[data-sized] .eg-job-body { max-height: none; flex: 1; min-height: 0; }

/* ---- prompt state ---- */
.eg-ask { display: flex; flex-direction: column; gap: 6px; padding: 8px 10px; }
.eg-ask-row { display: flex; align-items: center; gap: 6px; }
.eg-chips { display: flex; gap: 4px; flex-wrap: wrap; flex: 1; min-width: 0; }
.eg-chip-area { border-style: dashed; }
.eg-chip {
  color: var(--eg-accent);
  border: 1px solid var(--eg-accent-soft);
  background: var(--eg-accent-soft);
  border-radius: 3px;
  padding: 0 5px;
  white-space: nowrap;
}
.eg-model {
  position: relative;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 7px;
  border: 1px solid var(--eg-line);
  border-radius: 3px;
  color: var(--eg-muted);
  white-space: nowrap;
  flex: none;
  cursor: pointer;
}
.eg-model:hover, .eg-model:focus-within { border-color: var(--eg-accent); color: var(--eg-accent); }
.eg-model-select { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; }
.eg-model-select option { background: var(--eg-srf); color: var(--eg-ink); }
.eg-ask-input {
  width: 100%;
  background: none;
  border: none;
  outline: none;
  color: var(--eg-ink);
  font: var(--eg-prose);
  padding: 2px 0;
}
.eg-ask-input::placeholder { color: var(--eg-muted); }
.eg-ask-hint { color: var(--eg-muted); font-size: 10px; text-align: right; }

/* ---- job state ---- */
.eg-job { display: flex; flex-direction: column; }
.eg-job-head {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 7px 10px;
  border-bottom: 1px solid var(--eg-line);
}
.eg-dot { width: 7px; height: 7px; border-radius: 50%; flex: none; }
.eg-dot.queued { background: none; border: 1px solid var(--eg-muted); }
.eg-dot.running { background: var(--eg-accent); animation: eg-pulse 1.3s ease-in-out infinite; }
.eg-dot.done { background: var(--eg-ok); }
.eg-dot.failed { background: var(--eg-err); }
@keyframes eg-pulse { 50% { opacity: 0.3; } }
.eg-job-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--eg-ink); }
.eg-job-meta { color: var(--eg-muted); white-space: nowrap; }
.eg-x { color: var(--eg-muted); padding: 0 3px; font-size: 12px; }
.eg-x:hover { color: var(--eg-ink); }

.eg-job-body { display: flex; flex-direction: column; gap: 8px; padding: 8px 10px; max-height: 44vh; overflow-y: auto; }
.eg-steps { display: flex; flex-direction: column; }
.eg-step { position: relative; display: flex; align-items: baseline; gap: 8px; padding: 2px 0 2px 13px; flex-wrap: wrap; }
.eg-step::before {
  content: '';
  position: absolute;
  left: 2px;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--eg-line);
}
.eg-step:first-child::before { top: 50%; }
.eg-step:last-child::before { bottom: 50%; }
.eg-step:only-child::before { display: none; }
.eg-node {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--eg-line);
}
.eg-node-hot { background: var(--eg-accent); animation: eg-pulse 1.1s ease-in-out infinite; }
.eg-node-edit { border-radius: 1px; background: var(--eg-accent); transform: translateY(-50%) rotate(45deg); }
.eg-node-err { background: var(--eg-err); }
.eg-step-label { color: var(--eg-muted); }
.eg-step-hot .eg-step-label, .eg-step-edit .eg-step-label { color: var(--eg-ink); }
.eg-step-err .eg-step-label { color: var(--eg-err); }
.eg-step-btn { cursor: pointer; }
.eg-step-btn:hover .eg-file { text-decoration: underline; }
.eg-file { color: var(--eg-accent); }
.eg-file .dim { color: var(--eg-muted); }
.eg-ellipsis::after {
  content: '…';
  display: inline-block;
  width: 1.1em;
  animation: eg-dots 1.2s steps(4, end) infinite;
}
@keyframes eg-dots {
  0% { clip-path: inset(0 100% 0 0); }
  50% { clip-path: inset(0 50% 0 0); }
  100% { clip-path: inset(0 0 0 0); }
}
.eg-step-diff {
  flex-basis: 100%;
  white-space: pre-wrap;
  max-height: 110px;
  overflow-y: auto;
  background: var(--eg-srf-2);
  border-radius: 3px;
  padding: 5px 8px;
  margin: 2px 0 2px 13px;
  color: var(--eg-muted);
}
.eg-revert { color: var(--eg-err); }
.eg-revert:hover { text-decoration: underline; }
.eg-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--eg-muted);
  border-top: 1px solid var(--eg-line);
  padding: 6px 10px;
}
.eg-reply {
  flex: 1;
  min-width: 0;
  background: var(--eg-srf-2);
  border: 1px solid transparent;
  border-radius: 3px;
  padding: 4px 8px;
  font: var(--eg-prose);
  color: var(--eg-ink);
  outline: none;
}
.eg-reply:focus { border-color: var(--eg-accent); background: var(--eg-srf); }
.eg-foot-metrics { white-space: nowrap; }
.eg-turn-prompt {
  color: var(--eg-ink);
  background: var(--eg-srf-2);
  border-radius: 3px;
  padding: 4px 8px;
  align-self: flex-end;
  max-width: 90%;
}

/* ---- answer markdown (prose in sans, rest mono) ---- */
.eg-md { display: flex; flex-direction: column; gap: 6px; font: var(--eg-prose); color: var(--eg-ink); }
.eg-md-p { margin: 0; white-space: pre-wrap; }
.eg-md-h { font-weight: 600; }
.eg-md-h1 { font-size: 13.5px; }
.eg-md-h2, .eg-md-h3, .eg-md-h4 { font-size: 13px; }
.eg-md-list { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 2px; }
.eg-md-code {
  font: var(--eg-mono);
  background: var(--eg-srf-2);
  border-radius: 3px;
  padding: 1px 4px;
}
.eg-md-link { color: var(--eg-accent); text-decoration: none; }
.eg-md-link:hover { text-decoration: underline; }
.eg-md-pre {
  position: relative;
  margin: 0;
  background: var(--eg-srf-2);
  border-radius: var(--eg-radius);
  padding: 8px 10px;
  overflow-x: auto;
  font: var(--eg-mono);
  white-space: pre;
}
.eg-md-lang {
  position: absolute;
  top: 4px;
  right: 8px;
  font-size: 9px;
  color: var(--eg-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.eg-tk-comment { color: #9a9aa2; font-style: italic; }
.eg-tk-string { color: #57713f; }
.eg-tk-keyword { color: var(--eg-accent); }
.eg-tk-number { color: #8a5a2c; }
.eg-tk-type { color: #3d6280; }
.eg-md-swatch-wrap { white-space: nowrap; }
.eg-md-swatch {
  display: inline-block;
  width: 9px;
  height: 9px;
  border-radius: 2px;
  border: 1px solid var(--eg-line);
  margin-right: 4px;
}

/* ---- taskbar pills for jobs with a closed popover ---- */
.eg-tray {
  position: fixed;
  right: 16px;
  bottom: 52px;
  z-index: 2147483646;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}
.eg-tray-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--eg-srf);
  border-radius: var(--eg-radius);
  box-shadow: var(--eg-shadow);
  padding: 3px 9px;
  font: var(--eg-mono);
  color: var(--eg-ink);
  max-width: 260px;
}
.eg-tray-prompt { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ---- approval modal ---- */
.eg-scrim {
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  background: rgba(24, 24, 28, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
}
.eg-modal {
  width: min(420px, calc(100vw - 32px));
  background: var(--eg-srf);
  color: var(--eg-ink);
  border-radius: var(--eg-radius);
  box-shadow: var(--eg-shadow);
  padding: 12px;
  font: var(--eg-mono);
}
.eg-modal-title { margin-bottom: 8px; font: var(--eg-prose); }
.eg-modal-title b { color: var(--eg-accent); font-weight: 600; font-family: ui-monospace, monospace; }
.eg-modal-cmd { background: var(--eg-srf-2); border-radius: 3px; padding: 7px 9px; word-break: break-all; }
.eg-modal-diff { white-space: pre-wrap; max-height: 140px; overflow-y: auto; color: var(--eg-muted); margin-top: 8px; }
.eg-modal-actions { display: flex; gap: 14px; justify-content: flex-end; margin-top: 12px; }
.eg-act-deny { color: var(--eg-err); padding: 4px 8px; }
.eg-act-allow { color: var(--eg-ok); border: 1px solid var(--eg-line); border-radius: 3px; padding: 4px 12px; }
.eg-act-allow:hover { border-color: var(--eg-ok); }
`;
