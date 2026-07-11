/**
 * Minimal access to React internals in dev. Best-effort: if React changes its
 * internals, the adapter degrades to the DOM fallback (tagging) instead of
 * breaking selection.
 */

export { summarizeProps, summarizeValue } from '@eregion/overlay';

export interface FiberNode {
  type: unknown;
  return: FiberNode | null;
  memoizedProps: Record<string, unknown> | null;
}

const FIBER_KEY_PREFIX = '__reactFiber$';

export function getFiber(el: Element): FiberNode | null {
  for (const key of Object.keys(el)) {
    if (key.startsWith(FIBER_KEY_PREFIX)) {
      return (el as unknown as Record<string, FiberNode>)[key] ?? null;
    }
  }
  return null;
}

function isComponentType(type: unknown): type is { name?: string; displayName?: string } {
  return typeof type === 'function' || (typeof type === 'object' && type !== null);
}

export function componentNameOf(type: unknown): string | null {
  if (!isComponentType(type)) return null;
  const named = type as { displayName?: string; name?: string; render?: { name?: string } };
  // forwardRef/memo keep the inner function in .render/.type
  return named.displayName || named.name || named.render?.name || null;
}

/** Walks up from the host fiber (DOM tag) to the fiber of the component that rendered it. */
export function getComponentFiber(fiber: FiberNode): FiberNode | null {
  let current = fiber.return;
  while (current) {
    if (typeof current.type === 'function') return current;
    current = current.return;
  }
  return null;
}
