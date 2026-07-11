import { useEffect, useState } from 'preact/hooks';
interface UsageTotals {
  jobs: number;
  outputTokens: number;
  costUsd: number;
}
import type { SelectionEngine, EngineState } from '../selection-engine.js';
import type { ConnectionStatus, EregionClient } from '../ws-client.js';
import { HighlightLayer } from './highlight-layer.js';
import { Toolbar } from './toolbar.js';

interface Props {
  engine: SelectionEngine;
  client: EregionClient | null;
}

export function OverlayApp({ engine, client }: Props) {
  const [state, setState] = useState<EngineState>(engine.getState());
  const [connection, setConnection] = useState<ConnectionStatus>(client ? 'connecting' : 'closed');
  const [usage, setUsage] = useState<UsageTotals | null>(null);

  useEffect(() => engine.subscribe(setState), [engine]);
  useEffect(() => client?.onStatus(setConnection), [client]);
  useEffect(
    () =>
      client?.onMessage((msg) => {
        if (msg.type === 'usage.update') setUsage(msg.payload);
      }),
    [client],
  );

  return (
    <>
      <HighlightLayer state={state} />
      <Toolbar
        state={state}
        connection={connection}
        usage={usage}
        onToggle={() => engine.toggle()}
        onArea={() => (engine.getState().mode === 'area' ? engine.exitAreaMode() : engine.enterAreaMode())}
        onClear={() => engine.clear()}
      />
    </>
  );
}
