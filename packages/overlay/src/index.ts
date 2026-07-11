export const PKG = '@eregion/overlay' as const;

// Value summarization for the selection payload, shared by all adapters so the
// budget behavior (prop cap, ≤60-char truncation, dropping `children`) stays identical.
const MAX_PROPS = 10;
const MAX_VALUE_CHARS = 60;

function functionName(fn: unknown): string {
  const f = fn as { displayName?: string; name?: string; render?: { name?: string } };
  return f.displayName || f.name || f.render?.name || '';
}

/** Summarizes a single value as a short, transport-safe string. */
export function summarizeValue(value: unknown): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'string':
      return value.length > MAX_VALUE_CHARS ? `'${value.slice(0, MAX_VALUE_CHARS)}…'` : `'${value}'`;
    case 'number':
    case 'boolean':
      return String(value);
    case 'undefined':
      return 'undefined';
    case 'function':
      return `ƒ ${functionName(value)}`.trim();
    default: {
      try {
        const json = JSON.stringify(value);
        return json && json.length > MAX_VALUE_CHARS ? `${json.slice(0, MAX_VALUE_CHARS)}…` : (json ?? String(value));
      } catch {
        return Object.prototype.toString.call(value);
      }
    }
  }
}

/** Props/state summarized as strings; this is what goes into the payload. */
export function summarizeProps(
  props: Record<string, unknown> | null | undefined,
): Record<string, string> | undefined {
  if (!props) return undefined;
  const entries = Object.entries(props).filter(([key]) => key !== 'children');
  if (entries.length === 0) return undefined;
  const summary: Record<string, string> = {};
  for (const [key, value] of entries.slice(0, MAX_PROPS)) {
    summary[key] = summarizeValue(value);
  }
  const omitted = entries.length - MAX_PROPS;
  if (omitted > 0) summary['…'] = `+${omitted} props`;
  return summary;
}

export { registerAdapter, activeAdapters, type ComponentHit, type FrameworkAdapter } from './adapter.js';
export { domAdapter } from './dom-adapter.js';
export { SelectionEngine, areaAnchor, type AreaState, type EngineState } from './selection-engine.js';
export { EregionClient, type ClientOptions, type ConnectionStatus, type EregionGlobal } from './ws-client.js';
export { mount, DEVTOOLS_TAG, EregionDevtoolsElement, type MountOptions } from './devtools-element.js';
export {
  installNetworkPatch,
  recentRequests,
  recentHttpActivity,
  type NetworkPatchOptions,
  type RequestRecord,
} from './network-patch.js';
