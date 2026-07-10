/**
 * Acesso mínimo aos internals do React em dev. Tudo aqui é best-effort: se o
 * React mudar os internals, o adapter degrada para o fallback DOM (tagging),
 * nunca quebra a seleção.
 */

// O resumo de props vive em @eregion/overlay (compartilhado com o adapter Angular).
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
  // forwardRef/memo guardam a função interna em .render/.type
  return named.displayName || named.name || named.render?.name || null;
}

/** Sobe do fiber host (tag DOM) até o fiber do componente que o renderizou. */
export function getComponentFiber(fiber: FiberNode): FiberNode | null {
  let current = fiber.return;
  while (current) {
    if (typeof current.type === 'function') return current;
    current = current.return;
  }
  return null;
}
