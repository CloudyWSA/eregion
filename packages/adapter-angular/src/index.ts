// @eregion/adapter-angular — resolves DOM elements to Angular components using
// the framework's dev debug API (window.ng) plus the static index built by the
// daemon (className/selector → file:line). The index is loaded synchronously via
// loadAngularIndex; the integrator (@eregion/angular) is what requests it.
import { summarizeProps, type ComponentHit, type FrameworkAdapter } from '@eregion/overlay';
import type { AngularComponentEntry, AngularIndex } from '@eregion/protocol';

export const PKG = '@eregion/adapter-angular' as const;

/** Debug API that Angular exposes on `window.ng` only in dev mode. */
interface DirectiveMetadata {
  inputs?: Record<string, string>;
  outputs?: Record<string, string>;
  selector?: string;
}
interface NgGlobal {
  getComponent?(el: Element): unknown;
  getOwningComponent?(el: Element): unknown;
  getHostElement?(instance: unknown): Element | null;
  getDirectiveMetadata?(instance: unknown): DirectiveMetadata | null;
}

// In-memory index. Keyed by `className|selector`; on collision we keep all
// candidates and disambiguate at resolve time using the DOM tree.
let byKey = new Map<string, AngularComponentEntry[]>();
let byClassName = new Map<string, AngularComponentEntry[]>();
// Tag selectors known per project — used to break cross-project collisions by
// counting ancestors that match each project.
let projectSelectors = new Map<string, Set<string>>();

/** Populates the in-memory index (called by the integrator on daemon data). */
export function loadAngularIndex(index: AngularIndex): void {
  const keyed = new Map<string, AngularComponentEntry[]>();
  const named = new Map<string, AngularComponentEntry[]>();
  const projSel = new Map<string, Set<string>>();

  for (const entry of index.entries) {
    push(keyed, `${entry.className}|${entry.selector ?? ''}`, entry);
    push(named, entry.className, entry);
    if (entry.project && entry.selector) {
      let set = projSel.get(entry.project);
      if (!set) {
        set = new Set<string>();
        projSel.set(entry.project, set);
      }
      for (const tag of tagsOf(entry.selector)) set.add(tag);
    }
  }

  byKey = keyed;
  byClassName = named;
  projectSelectors = projSel;
}

/** Exposed for tests. */
export function clearAngularIndex(): void {
  byKey = new Map();
  byClassName = new Map();
  projectSelectors = new Map();
}

export const angularAdapter: FrameworkAdapter = {
  name: 'angular',
  priority: 10,
  detect(): boolean {
    return getNg() !== null;
  },
  resolve(el: Element): ComponentHit | null {
    const ng = getNg();
    if (!ng) return null;

    const instance = ng.getOwningComponent?.(el) ?? ng.getComponent?.(el);
    if (!instance) return null;
    const className = constructorName(instance);
    if (!className) return null;

    const meta = ng.getDirectiveMetadata?.(instance) ?? null;

    // Host: prefer what Angular reports; otherwise climb via the selector tag.
    let host = ng.getHostElement?.(instance) ?? null;
    // The metadata selector may be absent in some versions — fall back to the host tag.
    const metaSelector = meta && typeof meta.selector === 'string' ? meta.selector : undefined;
    const selector = metaSelector ?? (host ?? el).tagName.toLowerCase();
    if (!host) host = closestTag(el, selector) ?? el;

    const entry = lookup(className, selector, host);

    return {
      element: host,
      name: className,
      framework: 'angular',
      src: entry?.src,
      props: collectInputs(instance, meta),
      state: collectSignals(instance),
    };
  },
};

/** Picks the index entry for (className, selector), disambiguating collisions. */
function lookup(className: string, selector: string, host: Element): AngularComponentEntry | undefined {
  let candidates = byKey.get(`${className}|${selector}`);
  // The runtime selector may differ from the indexed one — fall back to className only.
  if (!candidates || candidates.length === 0) candidates = byClassName.get(className);
  if (!candidates || candidates.length === 0) return undefined;
  if (candidates.length === 1) return candidates[0];
  return disambiguate(candidates, host);
}

/**
 * Disambiguates by counting host ancestors whose tagName matches each candidate
 * project's selectors: the running app fills the DOM with its own components, so
 * the project with the most matched ancestors is the right one. Resolves
 * cross-project collisions; intra-project collisions (copies) tie and fall back
 * to the first candidate — the daemon refines later via template matching.
 */
function disambiguate(candidates: AngularComponentEntry[], host: Element): AngularComponentEntry {
  const chain: string[] = [];
  for (let node: Element | null = host; node; node = node.parentElement) {
    chain.push(node.tagName.toLowerCase());
  }

  let best = candidates[0]!;
  let bestScore = -1;
  for (const candidate of candidates) {
    const selectors = candidate.project ? projectSelectors.get(candidate.project) : undefined;
    let score = 0;
    if (selectors) {
      for (const tag of chain) if (selectors.has(tag)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

/** Reads the instance's declared inputs (via metadata) and summarizes the values. */
function collectInputs(instance: unknown, meta: DirectiveMetadata | null): Record<string, string> | undefined {
  const inputs = meta?.inputs;
  if (!inputs) return undefined;
  const record = instance as Record<string, unknown>;
  const values: Record<string, unknown> = {};
  for (const prop of Object.keys(inputs)) {
    try {
      const raw = record[prop];
      values[prop] = isSignal(raw) ? raw() : raw;
    } catch {
      // input with a throwing getter — ignore, best-effort.
    }
  }
  return summarizeProps(values);
}

/** Detects signals in the instance's properties and summarizes current values. */
function collectSignals(instance: unknown): Record<string, string> | undefined {
  const record = instance as Record<string, unknown>;
  const values: Record<string, unknown> = {};
  for (const key of Object.keys(record)) {
    const value = record[key];
    if (!isSignal(value)) continue;
    try {
      values[key] = value();
    } catch {
      // signal that throws when read — ignore.
    }
  }
  return summarizeProps(values);
}

function push(map: Map<string, AngularComponentEntry[]>, key: string, entry: AngularComponentEntry): void {
  const list = map.get(key);
  if (list) list.push(entry);
  else map.set(key, [entry]);
}

function getNg(): NgGlobal | null {
  if (typeof window === 'undefined') return null;
  const ng = (window as unknown as { ng?: NgGlobal }).ng;
  if (!ng) return null;
  if (typeof ng.getOwningComponent !== 'function' && typeof ng.getComponent !== 'function') return null;
  return ng;
}

function constructorName(instance: unknown): string | undefined {
  const ctor = (instance as { constructor?: { name?: string } }).constructor;
  const name = ctor?.name;
  return name && name.length > 0 ? name : undefined;
}

/**
 * An Angular signal is a getter function marked by an internal Symbol whose
 * description is 'SIGNAL'; WritableSignal also exposes .set/.update. Best-effort
 * detection — if it fails, the value simply won't appear in state.
 */
function isSignal(value: unknown): value is () => unknown {
  if (typeof value !== 'function') return false;
  const fn = value as { set?: unknown; update?: unknown };
  if (typeof fn.set === 'function' || typeof fn.update === 'function') return true;
  const bag = value as unknown as Record<symbol, unknown>;
  for (const sym of Object.getOwnPropertySymbols(value)) {
    if (sym.description === 'SIGNAL' && bag[sym] != null) return true;
  }
  return false;
}

/** Climbs from `el` to the ancestor whose tagName matches a tag selector. */
function closestTag(el: Element, selector: string): Element | null {
  for (const tag of tagsOf(selector)) {
    try {
      const found = el.closest(tag);
      if (found) return found;
    } catch {
      // invalid selector for closest — try the next.
    }
  }
  return null;
}

/** Extracts tag selectors (e.g. 'app-foo') from a composite CSS selector. */
function tagsOf(selector: string): string[] {
  const out: string[] = [];
  for (const part of selector.split(',')) {
    const tag = part.trim().toLowerCase();
    if (tag.length > 0 && isSimpleTag(tag)) out.push(tag);
  }
  return out;
}

/** Letters/digits/hyphen only → it's an element selector (not attribute/class). */
function isSimpleTag(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    const ok = (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 45; // a-z 0-9 -
    if (!ok) return false;
  }
  return true;
}
