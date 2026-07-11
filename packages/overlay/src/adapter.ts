import type { SourceRef } from '@eregion/protocol';

/** Result of resolving a DOM element to a component. */
export interface ComponentHit {
  /** Root host element of the component (for highlight and hierarchy). */
  element: Element;
  name: string;
  framework: 'react' | 'angular';
  /** Component class/function. */
  src?: SourceRef;
  /** Element clicked in the template/JSX. */
  tpl?: SourceRef;
  props?: Record<string, string>;
  state?: Record<string, string>;
  children?: string[];
}

/** One adapter per framework; the core asks each active adapter, in registration order. */
export interface FrameworkAdapter {
  name: string;
  /** Framework adapters outrank the DOM fallback (0); first to resolve wins. Default: 0. */
  priority?: number;
  /** Is the framework present on the page? (e.g. window.ng, React hook) */
  detect(): boolean;
  resolve(el: Element): ComponentHit | null;
  /** Other rendered instances of the SAME component; hover lights them all to show edit impact. */
  instancesOf?(hit: ComponentHit): Element[];
  /** Called after a framework re-render, to re-sync highlights. */
  onCommit?(cb: () => void): void;
}

const adapters: FrameworkAdapter[] = [];

export function registerAdapter(adapter: FrameworkAdapter): void {
  if (!adapters.some((a) => a.name === adapter.name)) adapters.push(adapter);
}

export function activeAdapters(): FrameworkAdapter[] {
  return adapters
    .filter((a) => {
      try {
        return a.detect();
      } catch {
        return false;
      }
    })
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
}

/** Exposed for tests. */
export function clearAdapters(): void {
  adapters.length = 0;
}
