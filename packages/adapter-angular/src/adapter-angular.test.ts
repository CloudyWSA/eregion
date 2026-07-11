// @vitest-environment jsdom
import type { AngularIndex } from '@eregion/protocol';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { angularAdapter, clearAngularIndex, loadAngularIndex } from './index.js';

interface DirectiveMetadata {
  inputs?: Record<string, string>;
  selector?: string;
}

// Host DOM → component instance map, the way window.ng sees it.
const hostMap = new Map<Element, object>();

function makeSignal<T>(value: T): () => T {
  const signal = () => value;
  // Mark with the internal Symbol Angular uses (description === 'SIGNAL').
  (signal as unknown as Record<symbol, unknown>)[Symbol('SIGNAL')] = { value };
  return signal;
}

function setupNg(): void {
  (window as unknown as { ng?: unknown }).ng = {
    getOwningComponent(el: Element): unknown {
      for (let node: Element | null = el; node; node = node.parentElement) {
        const inst = hostMap.get(node);
        if (inst) return inst;
      }
      return null;
    },
    getHostElement(instance: unknown): Element | null {
      for (const [host, inst] of hostMap) if (inst === instance) return host;
      return null;
    },
    getDirectiveMetadata(instance: unknown): DirectiveMetadata | null {
      return (instance as { __meta?: DirectiveMetadata }).__meta ?? null;
    },
  };
}

// Index with a cross-project collision: FiltersModalComponent + app-filters-modal
// exists in app-a and app-b; the parents (page-a / page-b) tell the projects apart.
const index: AngularIndex = {
  builtAtMs: 1,
  entries: [
    {
      className: 'FiltersModalComponent',
      selector: 'app-filters-modal',
      project: 'app-a',
      src: { file: 'projects/app-a/src/filters.component.ts', line: 3 },
    },
    {
      className: 'FiltersModalComponent',
      selector: 'app-filters-modal',
      project: 'app-b',
      src: { file: 'projects/app-b/src/filters.component.ts', line: 3 },
    },
    { className: 'PageAComponent', selector: 'app-page-a', project: 'app-a', src: { file: 'a/page.ts', line: 1 } },
    { className: 'PageBComponent', selector: 'app-page-b', project: 'app-b', src: { file: 'b/page.ts', line: 1 } },
  ],
};

beforeEach(() => {
  hostMap.clear();
  clearAngularIndex();
  loadAngularIndex(index);
  setupNg();
});

afterEach(() => {
  delete (window as unknown as { ng?: unknown }).ng;
});

describe('angularAdapter', () => {
  it('detect() is false without window.ng', () => {
    delete (window as unknown as { ng?: unknown }).ng;
    expect(angularAdapter.detect()).toBe(false);
  });

  it('resolve enriches with name, inputs and signals', () => {
    document.body.innerHTML =
      '<app-page-a><app-filters-modal><button id="t">x</button></app-filters-modal></app-page-a>';
    const modal = document.querySelector('app-filters-modal')!;

    class FiltersModalComponent {
      title = 'Filters';
      count = makeSignal(3);
      __meta: DirectiveMetadata = { selector: 'app-filters-modal', inputs: { title: 'title' } };
    }
    hostMap.set(modal, new FiltersModalComponent());

    const hit = angularAdapter.resolve(document.getElementById('t')!)!;
    expect(hit).toMatchObject({ name: 'FiltersModalComponent', framework: 'angular' });
    expect(hit.element).toBe(modal);
    expect(hit.props).toEqual({ title: "'Filters'" });
    expect(hit.state).toEqual({ count: '3' });
  });

  it('cross-project collision resolves to the project with the most matched ancestors', () => {
    document.body.innerHTML =
      '<app-page-a><app-filters-modal><span id="t">x</span></app-filters-modal></app-page-a>';
    const modal = document.querySelector('app-filters-modal')!;

    class FiltersModalComponent {
      __meta: DirectiveMetadata = { selector: 'app-filters-modal' };
    }
    hostMap.set(modal, new FiltersModalComponent());

    const hit = angularAdapter.resolve(document.getElementById('t')!)!;
    // app-page-a is an ancestor → project app-a wins the collision.
    expect(hit.src?.file).toBe('projects/app-a/src/filters.component.ts');
  });

  it('without window.ng, resolve returns null', () => {
    delete (window as unknown as { ng?: unknown }).ng;
    document.body.innerHTML = '<div id="d"></div>';
    expect(angularAdapter.resolve(document.getElementById('d')!)).toBeNull();
  });

  it('component outside the index still resolves by name, without src', () => {
    document.body.innerHTML = '<app-unknown><i id="t"></i></app-unknown>';
    const host = document.querySelector('app-unknown')!;
    class UnknownComponent {
      __meta: DirectiveMetadata = { selector: 'app-unknown' };
    }
    hostMap.set(host, new UnknownComponent());

    const hit = angularAdapter.resolve(document.getElementById('t')!)!;
    expect(hit.name).toBe('UnknownComponent');
    expect(hit.src).toBeUndefined();
    expect(hit.element).toBe(host);
  });
});
