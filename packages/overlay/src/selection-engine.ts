import type { HttpActivity, SelectedComponent, SelectionPayload } from '@eregion/protocol';
import { PROTOCOL_VERSION, TAG_ATTR } from '@eregion/protocol';
import { activeAdapters, type ComponentHit } from './adapter.js';

export interface EngineState {
  active: boolean;
  hover: ComponentHit | null;
  selected: ComponentHit[];
}

type Listener = (state: EngineState) => void;

/** Elementos da UI do Eregion (overlay e chat) nunca participam do hit-testing. */
const EREGION_TAGS = ['eregion-devtools', 'eregion-chat'];

function isEregionUi(el: Element): boolean {
  return EREGION_TAGS.some((tag) => el.tagName.toLowerCase() === tag || el.closest(tag) !== null);
}

export class SelectionEngine {
  private state: EngineState = { active: false, hover: null, selected: [] };
  private listeners = new Set<Listener>();
  private doc: Document;

  /**
   * Fonte opcional de atividade HTTP recente (setada pelo devtools-element a
   * partir do patch de rede). MVP: anexada ao primeiro componente selecionado.
   */
  httpProvider?: () => HttpActivity[];

  constructor(doc: Document = document) {
    this.doc = doc;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  getState(): EngineState {
    return this.state;
  }

  private emit(patch: Partial<EngineState>): void {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn(this.state);
  }

  toggle(): void {
    this.state.active ? this.disable() : this.enable();
  }

  enable(): void {
    if (this.state.active) return;
    this.doc.addEventListener('pointermove', this.onPointerMove, true);
    this.doc.addEventListener('click', this.onClick, true);
    this.doc.addEventListener('keydown', this.onKeyDown, true);
    this.doc.addEventListener('wheel', this.onWheel, { capture: true, passive: false });
    this.emit({ active: true });
  }

  disable(): void {
    if (!this.state.active) return;
    this.doc.removeEventListener('pointermove', this.onPointerMove, true);
    this.doc.removeEventListener('click', this.onClick, true);
    this.doc.removeEventListener('keydown', this.onKeyDown, true);
    this.doc.removeEventListener('wheel', this.onWheel, true);
    this.emit({ active: false, hover: null });
  }

  clear(): void {
    this.emit({ selected: [], hover: null });
  }

  /**
   * Resolve o elemento sob o ponto. Cursor sobre a UI do Eregion = nenhum
   * hit — pular para o que está atrás roubaria cliques dos popovers (e
   * selecionaria componentes escondidos sob eles).
   */
  hitTest(x: number, y: number): ComponentHit | null {
    const els = this.doc.elementsFromPoint(x, y);
    const top = els[0];
    if (!top || isEregionUi(top)) return null;
    return this.resolve(top);
  }

  resolve(el: Element): ComponentHit | null {
    for (const adapter of activeAdapters()) {
      const hit = adapter.resolve(el);
      if (hit) return hit;
    }
    return null;
  }

  private onPointerMove = (ev: PointerEvent): void => {
    const hit = this.hitTest(ev.clientX, ev.clientY);
    if (hit?.element !== this.state.hover?.element) this.emit({ hover: hit });
  };

  private onClick = (ev: MouseEvent): void => {
    const hit = this.hitTest(ev.clientX, ev.clientY);
    if (!hit) return;
    ev.preventDefault();
    ev.stopPropagation();
    if (ev.shiftKey) this.toggleSelected(hit);
    else this.emit({ selected: [hit] });
  };

  private onKeyDown = (ev: KeyboardEvent): void => {
    if (ev.key === 'Escape') {
      this.clear();
      this.disable();
    }
  };

  /** Roda do mouse sobe (deltaY < 0) ou desce na hierarquia de componentes sob o cursor. */
  private onWheel = (ev: WheelEvent): void => {
    const current = this.state.hover;
    if (!current) return;
    ev.preventDefault();
    if (ev.deltaY < 0) {
      const parent = current.element.parentElement && this.resolve(current.element.parentElement);
      if (parent && parent.element !== current.element) this.emit({ hover: parent });
    } else {
      const inner = current.element.querySelector(`:scope [${TAG_ATTR}]`);
      if (inner) {
        const child = this.resolve(inner);
        if (child && child.element !== current.element) this.emit({ hover: child });
      }
    }
  };

  toggleSelected(hit: ComponentHit): void {
    const idx = this.state.selected.findIndex((s) => s.element === hit.element);
    const selected =
      idx >= 0
        ? this.state.selected.filter((_, i) => i !== idx)
        : [...this.state.selected, hit];
    this.emit({ selected });
  }

  buildPayload(app: SelectionPayload['app']): SelectionPayload {
    // Atribuição por componente via stack fica para refinamento futuro; por ora
    // anexamos a atividade HTTP recente apenas ao primeiro selecionado (MVP).
    const http = this.httpProvider?.() ?? [];
    const selection = this.state.selected.map((hit, i): SelectedComponent => {
      const rect = hit.element.getBoundingClientRect();
      const text = hit.element.textContent?.trim().slice(0, 80) || undefined;
      return {
        id: `s${i + 1}`,
        name: hit.name,
        framework: hit.framework,
        src: hit.src,
        tpl: hit.tpl,
        dom: {
          tag: hit.element.tagName.toLowerCase(),
          rect: [rect.x, rect.y, rect.width, rect.height],
          text,
        },
        props: hit.props,
        state: hit.state,
        children: hit.children,
        http: i === 0 && http.length > 0 ? http : undefined,
      };
    });
    return { v: PROTOCOL_VERSION, app, selection };
  }
}
