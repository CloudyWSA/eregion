// @eregion/adapter-react — enriquece a resolução DOM (tagging) com os
// internals do React em dev: nome real do componente e props resumidas.
import { domAdapter, type ComponentHit, type FrameworkAdapter } from '@eregion/overlay';
import { componentNameOf, getComponentFiber, getFiber, summarizeProps } from './fiber.js';

export const PKG = '@eregion/adapter-react' as const;
export { getFiber, getComponentFiber, componentNameOf, summarizeProps } from './fiber.js';

export const reactAdapter: FrameworkAdapter = {
  name: 'react',
  priority: 10,
  detect() {
    return typeof window !== 'undefined';
  },
  resolve(el: Element): ComponentHit | null {
    // A base (elemento + arquivo:linha) vem do tagging de build — estável.
    const base = domAdapter.resolve(el);
    if (!base) return null;

    const fiber = getFiber(base.element);
    if (!fiber) return base;
    const component = getComponentFiber(fiber);
    if (!component) return base;

    return {
      ...base,
      name: componentNameOf(component.type) ?? base.name,
      props: summarizeProps(component.memoizedProps),
    };
  },
};
