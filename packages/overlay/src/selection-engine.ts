import type { AreaSelection, HttpActivity, PageComponent, SelectedComponent, SelectionPayload } from '@eregion/protocol';
import { parseTagValue, PROTOCOL_VERSION, TAG_ATTR } from '@eregion/protocol';
import { activeAdapters, type ComponentHit, type FrameworkAdapter } from './adapter.js';
import { domAdapter } from './dom-adapter.js';

/** Área desenhada com marquee, em coordenadas de PÁGINA (sobrevive a scroll). */
export interface AreaState {
  pageX: number;
  pageY: number;
  width: number;
  height: number;
  container: ComponentHit | null;
}

export interface EngineState {
  active: boolean;
  hover: ComponentHit | null;
  /** Demais instâncias do componente sob o cursor (mesma origem no código). */
  hoverKin: Element[];
  selected: ComponentHit[];
  /** Retângulo em desenho (viewport), enquanto o botão está pressionado. */
  marquee: DOMRect | null;
  area: AreaState | null;
}

/** Âncora sintética para popovers de área: rect de viewport seguindo o scroll. */
export function areaAnchor(area: AreaState): { getBoundingClientRect(): DOMRect; isConnected: boolean } {
  return {
    isConnected: true,
    getBoundingClientRect: () =>
      new DOMRect(area.pageX - window.scrollX, area.pageY - window.scrollY, area.width, area.height),
  };
}

const DRAG_THRESHOLD_PX = 6;

function intersects(a: DOMRect, b: DOMRect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function contains(outer: DOMRect, inner: DOMRect): boolean {
  return outer.left <= inner.left && outer.right >= inner.right && outer.top <= inner.top && outer.bottom >= inner.bottom;
}

type Listener = (state: EngineState) => void;

/** Elementos da UI do Eregion (overlay e chat) nunca participam do hit-testing. */
const EREGION_TAGS = ['eregion-devtools', 'eregion-chat'];

function isEregionUi(el: Element): boolean {
  return EREGION_TAGS.some((tag) => el.tagName.toLowerCase() === tag || el.closest(tag) !== null);
}

export class SelectionEngine {
  private state: EngineState = { active: false, hover: null, hoverKin: [], selected: [], marquee: null, area: null };
  private dragStart: { x: number; y: number } | null = null;
  private dragging = false;
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
    this.doc.addEventListener('pointerdown', this.onPointerDown, true);
    this.doc.addEventListener('pointerup', this.onPointerUp, true);
    this.doc.addEventListener('click', this.onClick, true);
    this.doc.addEventListener('keydown', this.onKeyDown, true);
    this.doc.addEventListener('wheel', this.onWheel, { capture: true, passive: false });
    this.emit({ active: true });
  }

  disable(): void {
    if (!this.state.active) return;
    this.doc.removeEventListener('pointermove', this.onPointerMove, true);
    this.doc.removeEventListener('pointerdown', this.onPointerDown, true);
    this.doc.removeEventListener('pointerup', this.onPointerUp, true);
    this.doc.removeEventListener('click', this.onClick, true);
    this.doc.removeEventListener('keydown', this.onKeyDown, true);
    this.doc.removeEventListener('wheel', this.onWheel, true);
    this.emit({ active: false, hover: null, hoverKin: [], marquee: null });
  }

  clear(): void {
    this.emit({ selected: [], hover: null, hoverKin: [], marquee: null, area: null });
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
    return this.resolveWithAdapter(el)?.hit ?? null;
  }

  private resolveWithAdapter(el: Element): { hit: ComponentHit; adapter: FrameworkAdapter } | null {
    for (const adapter of activeAdapters()) {
      const hit = adapter.resolve(el);
      if (hit) return { hit, adapter };
    }
    return null;
  }

  /** Instâncias irmãs do hit (excluindo ele próprio). */
  private kinOf(hit: ComponentHit, adapter: FrameworkAdapter): Element[] {
    const all = (adapter.instancesOf ?? domAdapter.instancesOf)?.call(adapter, hit) ?? [];
    return all.filter((el) => el !== hit.element);
  }

  private onPointerMove = (ev: PointerEvent): void => {
    if (this.dragStart) {
      const rect = this.marqueeRect(ev.clientX, ev.clientY);
      if (this.dragging || Math.max(rect.width, rect.height) > DRAG_THRESHOLD_PX) {
        this.dragging = true;
        this.emit({ marquee: rect, hover: null, hoverKin: [] });
        return;
      }
    }
    const els = this.doc.elementsFromPoint(ev.clientX, ev.clientY);
    const top = els[0];
    const resolved = !top || isEregionUi(top) ? null : this.resolveWithAdapter(top);
    if (resolved?.hit.element !== this.state.hover?.element) {
      this.emit({
        hover: resolved?.hit ?? null,
        hoverKin: resolved ? this.kinOf(resolved.hit, resolved.adapter) : [],
      });
    }
  };

  private onPointerDown = (ev: PointerEvent): void => {
    if (ev.button !== 0) return;
    const els = this.doc.elementsFromPoint(ev.clientX, ev.clientY);
    if (els[0] && isEregionUi(els[0])) return;
    this.dragStart = { x: ev.clientX, y: ev.clientY };
    this.dragging = false;
  };

  private marqueeRect(x: number, y: number): DOMRect {
    const s = this.dragStart!;
    return new DOMRect(Math.min(s.x, x), Math.min(s.y, y), Math.abs(x - s.x), Math.abs(y - s.y));
  }

  private onPointerUp = (ev: PointerEvent): void => {
    if (!this.dragStart) return;
    const wasDragging = this.dragging;
    const rect = this.marqueeRect(ev.clientX, ev.clientY);
    this.dragStart = null;
    this.dragging = false;
    if (!wasDragging) return; // clique normal — o onClick cuida
    ev.preventDefault();
    ev.stopPropagation();
    this.commitArea(rect);
  };

  /** Solta o marquee: afetados = intersecção; container = menor que contém tudo. */
  private commitArea(rect: DOMRect): void {
    const tagged = Array.from(this.doc.querySelectorAll(`[${TAG_ATTR}]`));
    const affected: ComponentHit[] = [];
    const seen = new Set<string>();
    let container: ComponentHit | null = null;
    let containerArea = Infinity;
    for (const el of tagged) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (intersects(r, rect) && !contains(r, rect)) {
        const hit = this.resolve(el);
        const key = el.getAttribute(TAG_ATTR)!;
        if (hit && !seen.has(key)) {
          seen.add(key);
          affected.push(hit);
        }
      }
      if (contains(r, rect)) {
        const size = r.width * r.height;
        if (size < containerArea) {
          const hit = this.resolve(el);
          if (hit) {
            container = hit;
            containerArea = size;
          }
        }
      }
    }
    this.emit({
      marquee: null,
      selected: affected,
      area: {
        pageX: rect.x + window.scrollX,
        pageY: rect.y + window.scrollY,
        width: rect.width,
        height: rect.height,
        container,
      },
    });
  }

  private onClick = (ev: MouseEvent): void => {
    // clique que encerra um drag de área não seleciona nada
    if (this.state.area && this.state.selected.length === 0 && ev.detail === 0) return;
    const hit = this.hitTest(ev.clientX, ev.clientY);
    if (!hit) return;
    ev.preventDefault();
    ev.stopPropagation();
    if (ev.shiftKey) this.toggleSelected(hit);
    else this.emit({ selected: [hit], area: null });
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

  /** Inventário compacto da página: componentes únicos + contagem (contexto lazy). */
  pageComponents(): PageComponent[] {
    const byTag = new Map<string, PageComponent>();
    for (const el of Array.from(this.doc.querySelectorAll(`[${TAG_ATTR}]`))) {
      const value = el.getAttribute(TAG_ATTR)!;
      const existing = byTag.get(value);
      if (existing) {
        existing.count += 1;
        continue;
      }
      const hit = this.resolve(el);
      const ref = parseTagValue(value);
      if (hit && ref) byTag.set(value, { name: hit.name, src: ref, count: 1 });
    }
    return Array.from(byTag.values());
  }

  private areaPayload(): AreaSelection | undefined {
    const a = this.state.area;
    if (!a) return undefined;
    const containerRef = a.container ? (a.container.src ?? a.container.tpl) : undefined;
    return {
      rect: [a.pageX - window.scrollX, a.pageY - window.scrollY, a.width, a.height],
      container:
        a.container && containerRef ? { name: a.container.name, src: containerRef } : undefined,
    };
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
    return {
      v: PROTOCOL_VERSION,
      app: { ...app, components: this.pageComponents() },
      selection,
      area: this.areaPayload(),
    };
  }
}
