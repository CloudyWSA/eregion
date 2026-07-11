import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';

/**
 * Popover ancorado a um elemento do app: nasce do notch que aponta o
 * componente, abre abaixo (ou acima, sem espaço) e segue scroll/resize.
 * Se o elemento sair do DOM (hot-reload), congela no último rect conhecido.
 */

const GAP = 10;
const WIDTH = 400;

export interface AnchorPos {
  top: number;
  left: number;
  place: 'below' | 'above';
}

export function computePosition(rect: DOMRect, popHeight: number, viewport: { w: number; h: number }): AnchorPos {
  const left = Math.max(8, Math.min(rect.left, viewport.w - WIDTH - 8));
  const below = rect.bottom + GAP;
  if (below + popHeight <= viewport.h - 8 || rect.top < popHeight + GAP) {
    return { top: Math.min(below, viewport.h - 60), left, place: 'below' };
  }
  return { top: Math.max(8, rect.top - GAP - popHeight), left, place: 'above' };
}

function useAnchor(el: Element, height: number): AnchorPos {
  const rect = () => {
    const r = el.isConnected ? el.getBoundingClientRect() : null;
    return r && (r.width > 0 || r.height > 0) ? r : null;
  };
  const [last, setLast] = useState<DOMRect>(() => rect() ?? new DOMRect(24, 24, 0, 0));

  useEffect(() => {
    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = rect();
        if (r) setLast(r);
      });
    };
    update();
    window.addEventListener('scroll', update, { capture: true, passive: true });
    window.addEventListener('resize', update, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [el]);

  return computePosition(last, height, { w: window.innerWidth, h: window.innerHeight });
}

interface Props {
  anchor: Element;
  /** Altura estimada para decidir acima/abaixo (o conteúdo rola internamente). */
  estimatedHeight?: number;
  children: ComponentChildren;
}

export function Anchored({ anchor, estimatedHeight = 160, children }: Props) {
  const pos = useAnchor(anchor, estimatedHeight);
  return (
    <div class="eg-pop" data-place={pos.place} style={{ top: `${pos.top}px`, left: `${pos.left}px` }}>
      <span class="eg-notch" />
      {children}
    </div>
  );
}
