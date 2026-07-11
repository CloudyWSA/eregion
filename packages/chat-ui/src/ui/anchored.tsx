import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

// Popover anchored to an app element; freezes at the last known rect if the
// element leaves the DOM (hot-reload).

const GAP = 10;
const DEFAULT_WIDTH = 400;
const MIN_W = 260;
const MIN_H = 72;

export interface AnchorPos {
  top: number;
  left: number;
  place: 'below' | 'above';
}

export function computePosition(
  rect: DOMRect,
  popHeight: number,
  width: number,
  viewport: { w: number; h: number },
): AnchorPos {
  const left = Math.max(8, Math.min(rect.left, viewport.w - width - 8));
  const below = rect.bottom + GAP;
  if (below + popHeight <= viewport.h - 8 || rect.top < popHeight + GAP) {
    return { top: Math.min(below, viewport.h - 60), left, place: 'below' };
  }
  return { top: Math.max(8, rect.top - GAP - popHeight), left, place: 'above' };
}

function useAnchor(el: AnchorTarget, height: number, width: number, frozen: boolean): AnchorPos {
  const rect = () => {
    const r = el.isConnected ? el.getBoundingClientRect() : null;
    return r && (r.width > 0 || r.height > 0) ? r : null;
  };
  const [last, setLast] = useState<DOMRect>(() => rect() ?? new DOMRect(24, 24, 0, 0));

  useEffect(() => {
    if (frozen) return;
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
  }, [el, frozen]);

  return computePosition(last, height, width, { w: window.innerWidth, h: window.innerHeight });
}

export type AnchorTarget = Element | { getBoundingClientRect(): DOMRect; isConnected: boolean };

interface Props {
  anchor: AnchorTarget;
  /** Estimated height to decide above/below (content scrolls internally). */
  estimatedHeight?: number;
  children: ComponentChildren;
}

type Gesture =
  | { kind: 'drag'; startX: number; startY: number; origTop: number; origLeft: number }
  | { kind: 'resize'; startX: number; startY: number; origW: number; origH: number };

export function Anchored({ anchor, estimatedHeight = 160, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const [detached, setDetached] = useState<{ top: number; left: number } | null>(null);
  const [size, setSize] = useState<{ w: number; h: number | null }>({ w: DEFAULT_WIDTH, h: null });

  const anchored = useAnchor(anchor, size.h ?? estimatedHeight, size.w, detached !== null);
  const pos = detached ?? anchored;
  const place = anchored.place;

  const onPointerDown = (e: PointerEvent) => {
    const target = e.target as Element;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (target.closest('.eg-resize')) {
      gesture.current = { kind: 'resize', startX: e.clientX, startY: e.clientY, origW: r.width, origH: r.height };
    } else if (target.closest('.eg-drag') && !target.closest('button, select, input, a')) {
      gesture.current = { kind: 'drag', startX: e.clientX, startY: e.clientY, origTop: r.top, origLeft: r.left };
    } else {
      return;
    }
    el.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  const onPointerMove = (e: PointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;
    if (g.kind === 'drag') {
      setDetached({
        top: Math.max(4, Math.min(g.origTop + dy, window.innerHeight - 40)),
        left: Math.max(4, Math.min(g.origLeft + dx, window.innerWidth - 60)),
      });
    } else {
      setSize({
        w: Math.max(MIN_W, Math.min(g.origW + dx, window.innerWidth - 16)),
        h: Math.max(MIN_H, Math.min(g.origH + dy, window.innerHeight - 16)),
      });
    }
  };

  const onPointerUp = (e: PointerEvent) => {
    if (!gesture.current) return;
    gesture.current = null;
    ref.current?.releasePointerCapture(e.pointerId);
  };

  return (
    <div
      ref={ref}
      class="eg-pop"
      data-place={place}
      data-detached={detached ? '' : undefined}
      data-sized={size.h !== null ? '' : undefined}
      style={{
        top: `${pos.top}px`,
        left: `${pos.left}px`,
        width: `${size.w}px`,
        height: size.h !== null ? `${size.h}px` : undefined,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <span class="eg-notch" />
      {children}
      <span class="eg-resize" title="Resize" />
    </div>
  );
}
