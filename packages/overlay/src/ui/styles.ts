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
  border: 1px solid #a8622fb0;
  border-radius: 3px;
  box-sizing: border-box;
}
.eg-box-hover { background: #a8622f10; }
.eg-box-kin { border-style: dashed; border-color: #a8622f60; background: #a8622f08; }
.eg-box-area { border-style: dashed; border-color: #a8622f; background: #a8622f0a; }
.eg-box-selected { border-color: #a8622f; background: #a8622f1a; }
.eg-label {
  position: absolute;
  top: -20px;
  left: -1px;
  max-width: 60vw;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  background: #fbfbfc;
  border: 1px solid #e4e4e9;
  color: #1d1d22;
  font: 10.5px/1.6 ui-monospace, monospace;
  padding: 0 6px;
  border-radius: 3px;
}
.eg-box-selected .eg-label { border-color: #a8622f66; color: #a8622f; }
.eg-toolbar {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 2147483647;
  display: flex;
  align-items: center;
  gap: 2px;
  background: #fbfbfc;
  border-radius: 4px;
  box-shadow: 0 6px 24px rgba(24, 24, 28, 0.14), 0 0 0 1px #e4e4e9;
  padding: 3px 4px;
  font: 12px system-ui, sans-serif;
}
.eg-btn {
  all: unset;
  cursor: pointer;
  color: #73737d;
  padding: 3px 8px;
  border-radius: 3px;
  font-size: 13px;
  line-height: 1;
}
.eg-btn:hover { color: #1d1d22; }
.eg-btn:focus-visible { outline: 1px solid #a8622f; }
.eg-btn-on { color: #a8622f; }
.eg-dot { width: 6px; height: 6px; border-radius: 50%; margin: 0 5px; }
.eg-dot-open { background: #4e7a5a; }
.eg-dot-connecting { background: #b8a06a; }
.eg-dot-closed { background: #ad554b; }
`;
