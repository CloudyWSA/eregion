/**
 * CSS do overlay, isolado no shadow root. Mesma linguagem do chat-ui:
 * quase-preto neutro, texto prata, acento cobre único. Sem gradientes.
 */
export const OVERLAY_CSS = `
:host { all: initial; }
@media (prefers-reduced-motion: reduce) {
  * { animation: none !important; transition: none !important; }
}
.eg-highlights, .eg-box { pointer-events: none; }
.eg-box {
  position: fixed;
  z-index: 2147483646;
  border: 1px solid #d08b5b99;
  border-radius: 3px;
  box-sizing: border-box;
}
.eg-box-hover { background: #d08b5b14; }
.eg-box-selected { border-color: #d08b5b; background: #d08b5b1f; }
.eg-label {
  position: absolute;
  top: -20px;
  left: -1px;
  max-width: 60vw;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  background: #101013;
  border: 1px solid #26262c;
  color: #d7d7dc;
  font: 10.5px/1.6 ui-monospace, monospace;
  padding: 0 6px;
  border-radius: 3px;
}
.eg-box-selected .eg-label { border-color: #d08b5b66; color: #d08b5b; }
.eg-toolbar {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 2147483647;
  display: flex;
  align-items: center;
  gap: 2px;
  background: #101013;
  border: 1px solid #26262c;
  border-radius: 6px;
  padding: 3px 4px;
  font: 12px system-ui, sans-serif;
}
.eg-btn {
  all: unset;
  cursor: pointer;
  color: #82828c;
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 13px;
  line-height: 1;
}
.eg-btn:hover { color: #d7d7dc; }
.eg-btn:focus-visible { outline: 1px solid #d08b5b; }
.eg-btn-on { color: #d08b5b; }
.eg-dot { width: 6px; height: 6px; border-radius: 50%; margin: 0 5px; }
.eg-dot-open { background: #8fae9a; }
.eg-dot-connecting { background: #b8a06a; }
.eg-dot-closed { background: #c98383; }
`;
