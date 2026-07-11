// @vitest-environment jsdom
import { formatTagValue, TAG_ATTR } from '@eregion/protocol';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// jsdom não implementa elementsFromPoint; o engine recebe o resultado dele.
function mockPoint(...els: Element[]): void {
  document.elementsFromPoint = () => els;
}
import { clearAdapters, registerAdapter } from './adapter.js';
import { domAdapter } from './dom-adapter.js';
import { SelectionEngine } from './selection-engine.js';

function setTag(el: Element, file: string, line: number, column = 1): void {
  el.setAttribute(TAG_ATTR, formatTagValue({ file, line, column }));
}

describe('domAdapter', () => {
  it('resolve pelo ancestral mais próximo com o atributo', () => {
    document.body.innerHTML = `<main><section><button id="alvo">ok</button></section></main>`;
    const section = document.querySelector('section')!;
    setTag(section, 'src/components/OrderList.tsx', 12, 3);
    const hit = domAdapter.resolve(document.getElementById('alvo')!);
    expect(hit).toMatchObject({
      element: section,
      name: 'OrderList',
      framework: 'react',
      tpl: { file: 'src/components/OrderList.tsx', line: 12, column: 3 },
    });
  });

  it('retorna null sem atributo no caminho', () => {
    document.body.innerHTML = `<div id="solto"></div>`;
    expect(domAdapter.resolve(document.getElementById('solto')!)).toBeNull();
  });
});

describe('SelectionEngine', () => {
  beforeEach(() => {
    clearAdapters();
    registerAdapter(domAdapter);
    document.body.innerHTML = `
      <main id="raiz">
        <button id="b1">um</button>
        <button id="b2">dois</button>
      </main>`;
    setTag(document.getElementById('raiz')!, 'src/App.tsx', 3);
    setTag(document.getElementById('b1')!, 'src/Button.tsx', 8);
    setTag(document.getElementById('b2')!, 'src/Button.tsx', 8);
  });
  afterEach(() => clearAdapters());

  function engineAt(el: Element): SelectionEngine {
    const engine = new SelectionEngine();
    mockPoint(el);
    engine.enable();
    return engine;
  }

  it('click seleciona; shift+click adiciona e remove', () => {
    const b1 = document.getElementById('b1')!;
    const b2 = document.getElementById('b2')!;
    const engine = engineAt(b1);

    b1.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(engine.getState().selected.map((s) => s.element)).toEqual([b1]);

    mockPoint(b2);
    b2.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
    expect(engine.getState().selected.map((s) => s.element)).toEqual([b1, b2]);

    b2.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
    expect(engine.getState().selected.map((s) => s.element)).toEqual([b1]);
  });

  it('Escape limpa a seleção e desativa', () => {
    const b1 = document.getElementById('b1')!;
    const engine = engineAt(b1);
    b1.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(engine.getState()).toMatchObject({ selected: [], active: false });
  });

  it('buildPayload gera ids sequenciais e payload válido no protocolo', async () => {
    const b1 = document.getElementById('b1')!;
    const b2 = document.getElementById('b2')!;
    const engine = engineAt(b1);
    b1.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    mockPoint(b2);
    b2.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));

    const payload = engine.buildPayload({ framework: 'react', name: 'app-teste', route: '/' });
    expect(payload.selection.map((s) => s.id)).toEqual(['s1', 's2']);
    const { SelectionPayload } = await import('@eregion/protocol');
    expect(SelectionPayload.safeParse(payload).success).toBe(true);
  });

  it('cursor sobre a UI do Eregion não gera hit (não seleciona o que está atrás)', () => {
    const overlayEl = document.createElement('eregion-chat');
    document.body.appendChild(overlayEl);
    const engine = new SelectionEngine();
    mockPoint(overlayEl, document.getElementById('b1')!);
    expect(engine.hitTest(0, 0)).toBeNull();
  });

  it('clique sobre a UI do Eregion não é interceptado (botões dos popovers funcionam)', () => {
    const chatEl = document.createElement('eregion-chat');
    document.body.appendChild(chatEl);
    const engine = new SelectionEngine();
    mockPoint(chatEl);
    engine.enable();
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
    chatEl.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
    expect(engine.getState().selected).toEqual([]);
  });
});
