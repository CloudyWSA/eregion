import type { AreaSelection, HttpActivity, PageComponent, SelectedComponent, SelectionPayload } from '@eregion/protocol';
import { parseTagValue, PROTOCOL_VERSION, TAG_ATTR } from '@eregion/protocol';
import { activeAdapters, type ComponentHit, type FrameworkAdapter } from './adapter.js';
import { domAdapter } from './dom-adapter.js';

/** Marquee-drawn area, in PAGE coordinates (survives scroll). */
export interface AreaState {
  pageX: number;
  pageY: number;
  width: number;
  height: number;
  container: ComponentHit | null;
}

export type SelectionMode = 'component' | 'area';

export interface EngineState {
  active: boolean;
  mode: SelectionMode;
  hover: ComponentHit | null;
  /** Other instances of the component under the cursor (same code origin). */
  hoverKin: Element[];
  selected: ComponentHit[];
  /** Rectangle being drawn (viewport), while the button is held down. */
  marquee: DOMRect | null;
  area: AreaState | null;
}

/** Synthetic anchor for area popovers: a viewport rect that follows scroll. */
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

/** Eregion UI elements (overlay and chat) never take part in hit-testing. */
const EREGION_TAGS = ['eregion-devtools', 'eregion-chat'];

function isEregionUi(el: Element): boolean {
  return EREGION_TAGS.some((tag) => el.tagName.toLowerCase() === tag || el.closest(tag) !== null);
}

export class SelectionEngine {
  private state: EngineState = {
    active: false,
    mode: 'component',
    hover: null,
    hoverKin: [],
    selected: [],
    marquee: null,
    area: null,
  };
  private dragStart: { x: number; y: number } | null = null;
  private dragging = false;
  private suppressNextClick = false;
  private listeners = new Set<Listener>();
  private doc: Document;

  /** Optional source of recent HTTP activity; attached to the first selected component. */
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

  enterAreaMode(): void {
    if (!this.state.active) this.enable();
    this.doc.body.style.cursor = 'crosshair';
    this.emit({ mode: 'area', hover: null, hoverKin: [] });
  }

  exitAreaMode(): void {
    this.doc.body.style.cursor = '';
    if (this.state.mode === 'area') this.emit({ mode: 'component' });
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
    this.doc.body.style.cursor = '';
    this.emit({ active: false, mode: 'component', hover: null, hoverKin: [], marquee: null });
  }

  clear(): void {
    this.emit({ selected: [], hover: null, hoverKin: [], marquee: null, area: null });
  }

  /** Resolves the element under the point. Cursor over Eregion UI yields no hit. */
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

  /** Sibling instances of the hit (excluding itself). */
  private kinOf(hit: ComponentHit, adapter: FrameworkAdapter): Element[] {
    const all = (adapter.instancesOf ?? domAdapter.instancesOf)?.call(adapter, hit) ?? [];
    return all.filter((el) => el !== hit.element);
  }

  private onPointerMove = (ev: PointerEvent): void => {
    if (this.state.mode === 'area') {
      if (!this.dragStart) return;
      const rect = this.marqueeRect(ev.clientX, ev.clientY);
      if (this.dragging || Math.max(rect.width, rect.height) > DRAG_THRESHOLD_PX) {
        this.dragging = true;
        this.emit({ marquee: rect, hover: null, hoverKin: [] });
      }
      return;
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
    if (ev.button !== 0 || this.state.mode !== 'area') return;
    const els = this.doc.elementsFromPoint(ev.clientX, ev.clientY);
    if (els[0] && isEregionUi(els[0])) return;
    ev.preventDefault();
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
    this.suppressNextClick = true;
    if (!wasDragging) return;
    ev.preventDefault();
    ev.stopPropagation();
    this.commitArea(rect);
    this.exitAreaMode();
  };

  /** Releases the marquee: affected = intersection; container = smallest that contains all. */
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

  /** Alt+click asks for an explanation instead of selecting (set by the host). */
  onExplain?: (hit: ComponentHit) => void;

  private onClick = (ev: MouseEvent): void => {
    // browsers fire a click right after the marquee's pointerup — swallow it
    if (this.suppressNextClick) {
      this.suppressNextClick = false;
      ev.preventDefault();
      ev.stopPropagation();
      return;
    }
    if (this.state.mode === 'area') {
      ev.preventDefault();
      ev.stopPropagation();
      return;
    }
    const hit = this.hitTest(ev.clientX, ev.clientY);
    if (!hit) return;
    ev.preventDefault();
    ev.stopPropagation();
    if (ev.altKey && this.onExplain) {
      this.emit({ selected: [hit], area: null });
      this.onExplain(hit);
      return;
    }
    if (ev.shiftKey) this.toggleSelected(hit);
    else this.emit({ selected: [hit], area: null });
  };

  private onKeyDown = (ev: KeyboardEvent): void => {
    if (ev.key === 'Escape') {
      if (this.state.mode === 'area') {
        this.exitAreaMode();
        this.emit({ marquee: null });
        return;
      }
      this.clear();
      this.disable();
    }
  };

  /** Mouse wheel moves up (deltaY < 0) or down the component hierarchy under the cursor. */
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

  /** Compact page inventory: unique components + count (lazy context). */
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
    // Recent HTTP activity is attached only to the first selected component.
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
