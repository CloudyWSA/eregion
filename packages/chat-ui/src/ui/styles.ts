/**
 * Sistema visual do Eregion — "forja de Eregion": superfícies quase-pretas
 * neutras, texto prata, UM acento cobre (seleção/interação). Sem gradientes,
 * sem glow; hierarquia por hairlines e espaçamento. Motion mínimo (120ms).
 */
export const TOKENS = `
  --eg-bg: #101013;
  --eg-bg-raised: #16161a;
  --eg-line: #26262c;
  --eg-text: #d7d7dc;
  --eg-muted: #82828c;
  --eg-copper: #d08b5b;
  --eg-copper-dim: #d08b5b66;
  --eg-ok: #8fae9a;
  --eg-err: #c98383;
  --eg-radius: 6px;
  --eg-font: 12.5px/1.5 system-ui, sans-serif;
  --eg-mono: 11.5px/1.5 ui-monospace, 'Cascadia Mono', monospace;
`;

export const CHAT_CSS = `
:host { all: initial; ${TOKENS} }
* { box-sizing: border-box; }
button { all: unset; cursor: pointer; }
@media (prefers-reduced-motion: reduce) {
  * { animation: none !important; transition: none !important; }
}

/* ---- command bar: aparece com a seleção, some no disparo ---- */
.eg-cmd {
  position: fixed;
  left: 50%;
  bottom: 20px;
  transform: translateX(-50%);
  z-index: 2147483647;
  display: flex;
  align-items: center;
  gap: 8px;
  width: min(560px, calc(100vw - 32px));
  padding: 8px 10px;
  background: var(--eg-bg);
  border: 1px solid var(--eg-line);
  border-radius: var(--eg-radius);
  font: var(--eg-font);
  color: var(--eg-text);
  animation: eg-rise 120ms ease-out;
}
@keyframes eg-rise {
  from { opacity: 0; transform: translate(-50%, 6px); }
  to { opacity: 1; transform: translate(-50%, 0); }
}
.eg-cmd-glyph { color: var(--eg-copper); font: var(--eg-mono); white-space: nowrap; }
.eg-cmd-chips { display: flex; gap: 4px; max-width: 40%; overflow: hidden; }
.eg-chip {
  font: var(--eg-mono);
  color: var(--eg-text);
  border: 1px solid var(--eg-copper-dim);
  border-radius: 4px;
  padding: 0 6px;
  white-space: nowrap;
}
.eg-cmd-input {
  flex: 1;
  min-width: 120px;
  background: none;
  border: none;
  outline: none;
  color: var(--eg-text);
  font: var(--eg-font);
}
.eg-cmd-input::placeholder { color: var(--eg-muted); }
.eg-cmd-hint { font: var(--eg-mono); color: var(--eg-muted); white-space: nowrap; }
.eg-cmd-model {
  appearance: none;
  background: none;
  border: none;
  outline: none;
  cursor: pointer;
  font: var(--eg-mono);
  color: var(--eg-muted);
  max-width: 90px;
  text-overflow: ellipsis;
}
.eg-cmd-model:hover, .eg-cmd-model:focus-visible { color: var(--eg-copper); }
.eg-cmd-model option { background: var(--eg-bg); color: var(--eg-text); }

/* ---- activity rail: pills dos jobs, canto inferior direito ---- */
.eg-rail {
  position: fixed;
  right: 16px;
  bottom: 56px;
  z-index: 2147483646;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  max-width: 320px;
}
.eg-pill {
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 100%;
  background: var(--eg-bg);
  border: 1px solid var(--eg-line);
  border-radius: var(--eg-radius);
  padding: 5px 10px;
  font: var(--eg-font);
  color: var(--eg-text);
  animation: eg-rise-r 160ms ease-out;
  cursor: pointer;
}
@keyframes eg-rise-r {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}
.eg-pill-prompt { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.eg-pill-state { font: var(--eg-mono); color: var(--eg-muted); white-space: nowrap; }
.eg-pill-state.run { color: var(--lane, var(--eg-copper)); }
.eg-pill.eg-lane-copper { --lane: var(--eg-copper); }
.eg-pill.eg-lane-steel { --lane: #8fa8c0; }
.eg-pill-state.ok { color: var(--eg-ok); }
.eg-pill-state.err { color: var(--eg-err); }

/* ---- drawer: histórico completo + chat livre ---- */
.eg-drawer {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 2147483647;
  width: min(420px, 100vw);
  display: flex;
  flex-direction: column;
  background: var(--eg-bg);
  border-left: 1px solid var(--eg-line);
  color: var(--eg-text);
  font: var(--eg-font);
}
.eg-drawer-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--eg-line);
}
.eg-drawer-title { flex: 1; letter-spacing: 0.04em; }
.eg-drawer-title b { color: var(--eg-copper); font-weight: 400; }
.eg-close { color: var(--eg-muted); padding: 2px 6px; }
.eg-close:hover { color: var(--eg-text); }
.eg-jobs { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 10px; }
.eg-empty { color: var(--eg-muted); margin: auto; text-align: center; max-width: 240px; }
.eg-empty kbd {
  font: var(--eg-mono);
  border: 1px solid var(--eg-line);
  border-radius: 4px;
  padding: 0 5px;
}

/* ---- card de job: a linha de forja ---- */
.eg-card {
  background: var(--eg-bg-raised);
  border: 1px solid var(--eg-line);
  border-radius: var(--eg-radius);
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.eg-lane-copper { --lane: var(--eg-copper); }
.eg-lane-steel { --lane: #8fa8c0; }
.eg-card-head {
  all: unset;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  box-sizing: border-box;
}
.eg-card-head:focus-visible { outline: 1px solid var(--eg-copper); border-radius: 4px; }
.eg-card-prompt-inline {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--eg-muted);
}
.eg-card-open .eg-card-head { padding-bottom: 2px; }
.eg-card-body { display: flex; flex-direction: column; gap: 7px; }
.eg-status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--lane);
  flex: none;
}
.eg-status-dot.running { animation: eg-pulse 1.4s ease-in-out infinite; }
.eg-status-dot.queued { background: none; border: 1px solid var(--eg-muted); }
.eg-status-dot.done { background: var(--eg-ok); }
.eg-status-dot.failed { background: var(--eg-err); }
@keyframes eg-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}
.eg-card-targets { display: flex; gap: 4px; flex-wrap: nowrap; min-width: 0; }
.eg-card-open .eg-card-targets { flex-wrap: wrap; flex: 1; }
.eg-chip {
  font: var(--eg-mono);
  color: var(--eg-text);
  border: 1px solid color-mix(in srgb, var(--lane, var(--eg-copper)) 45%, transparent);
  border-radius: 4px;
  padding: 0 6px;
  white-space: nowrap;
}
.eg-card-meta { font: var(--eg-mono); color: var(--eg-muted); white-space: nowrap; }
.eg-card-prompt { margin: 0; font-size: 13px; font-weight: 500; color: var(--eg-text); line-height: 1.45; }

.eg-steps { display: flex; flex-direction: column; position: relative; padding-left: 3px; }
.eg-step {
  position: relative;
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 3px 0 3px 14px;
  flex-wrap: wrap;
}
/* o spine: cada passo desenha seu trecho da linha, na cor do metal da sessão */
.eg-step::before {
  content: '';
  position: absolute;
  left: 2.5px;
  top: 0;
  bottom: 0;
  width: 1px;
  background: color-mix(in srgb, var(--lane) 35%, transparent);
}
.eg-step:first-child::before { top: 50%; }
.eg-step:last-child::before { bottom: 50%; }
.eg-step:only-child::before { display: none; }
.eg-node {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--lane) 55%, var(--eg-bg-raised));
}
.eg-node-hot { background: var(--lane); animation: eg-pulse 1.1s ease-in-out infinite; }
.eg-node-edit { border-radius: 1px; background: var(--lane); transform: translateY(-50%) rotate(45deg); }
.eg-node-err { background: var(--eg-err); }
.eg-step-label { font: var(--eg-mono); color: var(--eg-muted); }
.eg-step-hot .eg-step-label { color: var(--eg-text); }
.eg-step-edit .eg-step-label { color: var(--eg-text); }
.eg-step-err .eg-step-label { color: var(--eg-err); }
.eg-step-btn { cursor: pointer; }
.eg-step-btn:hover { color: var(--eg-text); }
.eg-file .dim { color: var(--eg-muted); }
.eg-file { color: var(--lane); }
.eg-ellipsis::after {
  content: '…';
  display: inline-block;
  width: 1.2em;
  text-align: left;
  animation: eg-dots 1.2s steps(4, end) infinite;
}
@keyframes eg-dots {
  0% { clip-path: inset(0 100% 0 0); }
  40% { clip-path: inset(0 66% 0 0); }
  70% { clip-path: inset(0 33% 0 0); }
  100% { clip-path: inset(0 0 0 0); }
}
.eg-step-diff {
  flex-basis: 100%;
  font: var(--eg-mono);
  white-space: pre-wrap;
  max-height: 120px;
  overflow-y: auto;
  border-left: 1px solid var(--eg-line);
  padding-left: 10px;
  margin: 2px 0 2px 14px;
  color: var(--eg-muted);
}
.eg-steps-summary {
  align-self: flex-start;
  font: var(--eg-mono);
  color: var(--eg-muted);
  padding: 1px 0;
  cursor: pointer;
}
.eg-steps-summary:hover { color: var(--eg-text); }
.eg-revert { color: var(--eg-err); font: var(--eg-mono); }
.eg-revert:hover { text-decoration: underline; }
.eg-card-answer {
  margin: 0;
  color: var(--eg-muted);
  border-left: 1px solid var(--eg-line);
  padding-left: 10px;
  line-height: 1.5;
}

/* ---- markdown das respostas ---- */
.eg-md { display: flex; flex-direction: column; gap: 6px; }
.eg-md-p { margin: 0; white-space: pre-wrap; }
.eg-md-h { color: var(--eg-text); font-weight: 600; }
.eg-md-h1 { font-size: 14px; }
.eg-md-h2 { font-size: 13.5px; }
.eg-md-h3, .eg-md-h4 { font-size: 13px; }
.eg-md-list { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 2px; }
.eg-md-code {
  font: var(--eg-mono);
  background: var(--eg-bg);
  border: 1px solid var(--eg-line);
  border-radius: 4px;
  padding: 0 4px;
  color: var(--eg-text);
}
.eg-md-link { color: var(--eg-copper); text-decoration: none; }
.eg-md-link:hover { text-decoration: underline; }
.eg-md-pre {
  position: relative;
  margin: 0;
  background: var(--eg-bg);
  border: 1px solid var(--eg-line);
  border-radius: var(--eg-radius);
  padding: 8px 10px;
  overflow-x: auto;
  font: var(--eg-mono);
  color: var(--eg-text);
  white-space: pre;
}
.eg-md-lang {
  position: absolute;
  top: 4px;
  right: 8px;
  font-size: 9.5px;
  color: var(--eg-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.eg-tk-comment { color: #6a6a72; font-style: italic; }
.eg-tk-string { color: #a8bc8f; }
.eg-tk-keyword { color: var(--eg-copper); }
.eg-tk-number { color: #c9a26d; }
.eg-tk-type { color: #8fa8c0; }
.eg-md-swatch-wrap { white-space: nowrap; }
.eg-md-swatch {
  display: inline-block;
  width: 9px;
  height: 9px;
  border-radius: 2px;
  border: 1px solid var(--eg-line);
  margin-right: 4px;
  vertical-align: baseline;
}
.eg-card-foot { font: var(--eg-mono); color: var(--eg-muted); }
.eg-drawer-foot { border-top: 1px solid var(--eg-line); padding: 10px 14px; display: flex; flex-direction: column; gap: 8px; }
.eg-meter { display: flex; justify-content: space-between; font: var(--eg-mono); color: var(--eg-muted); }
.eg-free { display: flex; gap: 8px; }
.eg-free-input {
  flex: 1;
  background: var(--eg-bg);
  border: 1px solid var(--eg-line);
  border-radius: var(--eg-radius);
  color: var(--eg-text);
  font: var(--eg-font);
  padding: 6px 10px;
  outline: none;
}
.eg-free-input:focus { border-color: var(--eg-copper-dim); }
.eg-send { color: var(--eg-copper); padding: 4px 8px; }

/* ---- modal de aprovação ---- */
.eg-scrim {
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  background: rgba(8, 8, 10, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
}
.eg-modal {
  width: min(440px, calc(100vw - 32px));
  background: var(--eg-bg);
  border: 1px solid var(--eg-line);
  border-radius: var(--eg-radius);
  padding: 14px;
  color: var(--eg-text);
  font: var(--eg-font);
}
.eg-modal-title { margin-bottom: 8px; }
.eg-modal-title b { color: var(--eg-copper); font-weight: 400; font-family: ui-monospace, monospace; }
.eg-modal-cmd {
  font: var(--eg-mono);
  background: var(--eg-bg-raised);
  border: 1px solid var(--eg-line);
  border-radius: 4px;
  padding: 8px 10px;
  word-break: break-all;
}
.eg-modal-diff { font: var(--eg-mono); white-space: pre-wrap; max-height: 140px; overflow-y: auto; color: var(--eg-muted); margin-top: 8px; }
.eg-modal-actions { display: flex; gap: 12px; justify-content: flex-end; margin-top: 12px; }
.eg-act-deny { color: var(--eg-err); padding: 5px 10px; }
.eg-act-allow { color: var(--eg-ok); border: 1px solid var(--eg-line); border-radius: var(--eg-radius); padding: 5px 12px; }
.eg-act-allow:hover { border-color: var(--eg-ok); }
button:focus-visible { outline: 1px solid var(--eg-copper); outline-offset: 2px; border-radius: 4px; }
`;
