import { parseTagValue, TAG_ATTR } from '@eregion/protocol';
import type { ComponentHit, FrameworkAdapter } from './adapter.js';

function componentNameFrom(file: string): string {
  const base = file.slice(file.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(0, dot) : base;
}

/**
 * Minimal adapter based only on the build-injected attribute (TAG_ATTR).
 * Works on any tagged app without framework internals; the react adapter
 * enriches on top (real component name, props, tree).
 */
export const domAdapter: FrameworkAdapter = {
  name: 'dom',
  detect() {
    return true;
  },
  instancesOf(hit: ComponentHit): Element[] {
    const value = hit.element.getAttribute(TAG_ATTR);
    if (!value) return [];
    // value is ours (path:line:column); escape quotes/backslash for the selector
    const escaped = value.split('\\').join('\\\\').split('"').join('\\"');
    return Array.from(document.querySelectorAll(`[${TAG_ATTR}="${escaped}"]`));
  },
  resolve(el: Element): ComponentHit | null {
    const target = el.closest(`[${TAG_ATTR}]`);
    if (!target) return null;
    const ref = parseTagValue(target.getAttribute(TAG_ATTR)!);
    if (!ref) return null;
    return {
      element: target,
      name: componentNameFrom(ref.file),
      framework: 'react',
      tpl: ref,
    };
  },
};
