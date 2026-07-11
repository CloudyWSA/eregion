import { useEffect, useState } from 'preact/hooks';
import type { ComponentHit } from '../adapter.js';
import type { EngineState } from '../selection-engine.js';

interface Props {
  state: EngineState;
}

interface Box {
  rect: DOMRect;
  kind: 'hover' | 'selected' | 'kin';
  label?: string;
}

function labelFor(hit: ComponentHit, kinCount: number): string {
  const ref = hit.tpl ?? hit.src;
  const base = ref ? `${hit.name} — ${ref.file}:${ref.line}` : hit.name;
  // ×N comunica o raio de impacto: editar o componente muda todas as instâncias
  return kinCount > 0 ? `${base} ×${kinCount + 1}` : base;
}

function collectBoxes(state: EngineState): Box[] {
  const boxes: Box[] = state.selected.map((hit) => ({
    rect: hit.element.getBoundingClientRect(),
    kind: 'selected' as const,
    label: labelFor(hit, 0),
  }));
  if (state.hover && !state.selected.some((s) => s.element === state.hover!.element)) {
    for (const el of state.hoverKin) {
      boxes.push({ rect: el.getBoundingClientRect(), kind: 'kin' });
    }
    boxes.push({
      rect: state.hover.element.getBoundingClientRect(),
      kind: 'hover',
      label: labelFor(state.hover, state.hoverKin.length),
    });
  }
  return boxes;
}

/**
 * Caixas de highlight posicionadas por getBoundingClientRect (coordenadas de
 * viewport, position: fixed). Re-lê os rects em scroll/resize.
 */
export function HighlightLayer({ state }: Props) {
  const [boxes, setBoxes] = useState<Box[]>(() => collectBoxes(state));

  useEffect(() => {
    setBoxes(collectBoxes(state));
    const update = () => setBoxes(collectBoxes(state));
    window.addEventListener('scroll', update, { capture: true, passive: true });
    window.addEventListener('resize', update, { passive: true });
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [state]);

  return (
    <div class="eg-highlights">
      {boxes.map(({ rect, kind, label }, i) => (
        <div
          key={i}
          class={`eg-box eg-box-${kind}`}
          style={{ left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px` }}
        >
          {label && <span class="eg-label">{label}</span>}
        </div>
      ))}
    </div>
  );
}
