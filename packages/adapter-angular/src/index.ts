// @eregion/adapter-angular — resolve elementos do DOM para componentes Angular
// usando a API de debug do framework em dev (window.ng) + o índice estático
// construído pelo daemon (className/selector → arquivo:linha). O índice chega
// de forma síncrona via loadAngularIndex; quem o pede ao daemon é o integrador
// (@eregion/angular).
import { summarizeProps, type ComponentHit, type FrameworkAdapter } from '@eregion/overlay';
import type { AngularComponentEntry, AngularIndex } from '@eregion/protocol';

export const PKG = '@eregion/adapter-angular' as const;

/** API de debug que o Angular expõe em `window.ng` apenas em modo dev. */
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

// Índice em memória. Chaveado por `className|selector`; em colisão guardamos
// todos os candidatos e desambiguamos no resolve pela árvore do DOM.
let byKey = new Map<string, AngularComponentEntry[]>();
let byClassName = new Map<string, AngularComponentEntry[]>();
// selectors de tag conhecidos por projeto — usado para desempatar colisões
// cross-project contando ancestrais que casam com cada projeto.
let projectSelectors = new Map<string, Set<string>>();

/** Popula o índice em memória (chamado pelo integrador ao receber do daemon). */
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

/** Visível para testes. */
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

    // Host: preferimos o que o Angular reporta; senão subimos pelo tag do selector.
    let host = ng.getHostElement?.(instance) ?? null;
    // O selector do metadata pode não vir em toda versão — cai no tag do host.
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

/** Escolhe a entry do índice para (className, selector), desambiguando colisões. */
function lookup(className: string, selector: string, host: Element): AngularComponentEntry | undefined {
  let candidates = byKey.get(`${className}|${selector}`);
  // O selector do runtime pode divergir do indexado — cai para só o className.
  if (!candidates || candidates.length === 0) candidates = byClassName.get(className);
  if (!candidates || candidates.length === 0) return undefined;
  if (candidates.length === 1) return candidates[0];
  return disambiguate(candidates, host);
}

/**
 * Desambigua contando ancestrais do host cujo tagName casa com selectors de
 * cada projeto candidato: o app em execução preenche o DOM com seus próprios
 * componentes, então o projeto com mais ancestrais casados é o correto. Resolve
 * as colisões cross-project; colisões intra-projeto (cópias) empatam e caímos
 * no primeiro candidato — o daemon refina depois por matching de template.
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

/** Lê os inputs declarados (via metadata) do instance e resume os valores. */
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
      // input com getter que lança — ignora, best-effort.
    }
  }
  return summarizeProps(values);
}

/** Detecta signals nas propriedades do instance e resume os valores atuais. */
function collectSignals(instance: unknown): Record<string, string> | undefined {
  const record = instance as Record<string, unknown>;
  const values: Record<string, unknown> = {};
  for (const key of Object.keys(record)) {
    const value = record[key];
    if (!isSignal(value)) continue;
    try {
      values[key] = value();
    } catch {
      // signal que lança ao ler — ignora.
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
 * Um signal do Angular é uma função-getter marcada por um Symbol interno cuja
 * description é 'SIGNAL'; WritableSignal ainda expõe .set/.update. Detecção
 * best-effort — se falhar, o valor só não aparece no state.
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

/** Sobe de `el` até o ancestral cujo tagName casa com um selector de tag. */
function closestTag(el: Element, selector: string): Element | null {
  for (const tag of tagsOf(selector)) {
    try {
      const found = el.closest(tag);
      if (found) return found;
    } catch {
      // selector inválido para closest — tenta o próximo.
    }
  }
  return null;
}

/** Extrai os selectors de tag (ex: 'app-foo') de um selector CSS composto. */
function tagsOf(selector: string): string[] {
  const out: string[] = [];
  for (const part of selector.split(',')) {
    const tag = part.trim().toLowerCase();
    if (tag.length > 0 && isSimpleTag(tag)) out.push(tag);
  }
  return out;
}

/** Só letras/dígitos/hífen → é seletor de elemento (não atributo/classe). */
function isSimpleTag(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    const ok = (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 45; // a-z 0-9 -
    if (!ok) return false;
  }
  return true;
}
