import type { ConnectionStatus } from '../ws-client.js';
import type { EngineState } from '../selection-engine.js';

interface Props {
  state: EngineState;
  connection: ConnectionStatus;
  onToggle(): void;
  onClear(): void;
}

export function Toolbar({ state, connection, onToggle, onClear }: Props) {
  return (
    <div class="eg-toolbar">
      <button
        class={`eg-btn ${state.active ? 'eg-btn-on' : ''}`}
        onClick={onToggle}
        title={state.active ? 'Sair do modo seleção (Esc)' : 'Selecionar componentes (Alt+S)'}
      >
        ⟡
      </button>
      {state.selected.length > 0 && (
        <button class="eg-btn" onClick={onClear} title="Limpar seleção (Esc)">
          {state.selected.length}✕
        </button>
      )}
      <span class={`eg-dot eg-dot-${connection}`} title={`daemon: ${connection}`} />
    </div>
  );
}
