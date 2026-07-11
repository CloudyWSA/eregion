import type { ConnectionStatus } from '../ws-client.js';
import type { EngineState } from '../selection-engine.js';

interface Props {
  state: EngineState;
  connection: ConnectionStatus;
  usage: { jobs: number; outputTokens: number; costUsd: number } | null;
  onToggle(): void;
  onArea(): void;
  onClear(): void;
}

export function Toolbar({ state, connection, usage, onToggle, onArea, onClear }: Props) {
  return (
    <div class="eg-toolbar">
      <button
        class={`eg-btn ${state.mode === 'area' ? 'eg-btn-on' : ''}`}
        onClick={onArea}
        title={state.mode === 'area' ? 'Exit area drawing (Esc)' : 'Draw an area (Alt+A)'}
      >
        ▧
      </button>
      <button
        class={`eg-btn ${state.active && state.mode === 'component' ? 'eg-btn-on' : ''}`}
        onClick={onToggle}
        title={state.active ? 'Exit selection mode (Esc)' : 'Select components (Alt+S)'}
      >
        ⟡
      </button>
      {state.selected.length > 0 && (
        <button class="eg-btn" onClick={onClear} title="Clear selection (Esc)">
          {state.selected.length}✕
        </button>
      )}
      {usage && usage.jobs > 0 && (
        <span class="eg-usage" title={`${usage.jobs} request(s) · ${usage.outputTokens} tokens this session`}>
          ${usage.costUsd.toFixed(2)}
        </span>
      )}
      <span class={`eg-dot eg-dot-${connection}`} title={`daemon: ${connection}`} />
    </div>
  );
}
