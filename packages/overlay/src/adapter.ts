import type { SourceRef } from '@eregion/protocol';

/** Resultado de resolver um elemento DOM para um componente. */
export interface ComponentHit {
  /** Elemento host raiz do componente (para highlight e hierarquia). */
  element: Element;
  name: string;
  framework: 'react' | 'angular';
  /** Classe/função do componente. */
  src?: SourceRef;
  /** Elemento clicado no template/JSX. */
  tpl?: SourceRef;
  props?: Record<string, string>;
  state?: Record<string, string>;
  children?: string[];
}

/**
 * Um adapter por framework. O núcleo do overlay é agnóstico: pergunta a cada
 * adapter ativo, na ordem de registro, quem consegue resolver o elemento.
 */
export interface FrameworkAdapter {
  name: string;
  /**
   * Adapters de framework (react, angular) têm prioridade maior que o
   * fallback DOM (0) — o primeiro que resolver ganha. Default: 0.
   */
  priority?: number;
  /** O framework está presente na página? (ex: window.ng, hook do React) */
  detect(): boolean;
  resolve(el: Element): ComponentHit | null;
  /** Chamado após re-render do framework, para re-sincronizar highlights. */
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

/** Visível para testes. */
export function clearAdapters(): void {
  adapters.length = 0;
}
