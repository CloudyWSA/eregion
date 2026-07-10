// @vitest-environment jsdom
import { formatTagValue, TAG_ATTR } from '@eregion/protocol';
import { describe, expect, it } from 'vitest';
import { reactAdapter } from './index.js';
import type { FiberNode } from './fiber.js';

function makeButtonWithFiber(props: Record<string, unknown>): HTMLElement {
  document.body.innerHTML = '<button id="alvo">Salvar</button>';
  const el = document.getElementById('alvo')!;
  el.setAttribute(TAG_ATTR, formatTagValue({ file: 'src/components/SaveButton.tsx', line: 7, column: 3 }));
  function SaveButton() {}
  const componentFiber: FiberNode = { type: SaveButton, return: null, memoizedProps: props };
  const hostFiber: FiberNode = { type: 'button', return: componentFiber, memoizedProps: null };
  Object.defineProperty(el, '__reactFiber$teste', { value: hostFiber, enumerable: true });
  return el;
}

describe('reactAdapter', () => {
  it('enriquece o hit do tagging com nome real e props do fiber', () => {
    const el = makeButtonWithFiber({
      label: 'Salvar',
      disabled: false,
      onClick: function onClick() {},
      children: 'nunca aparece',
    });
    const hit = reactAdapter.resolve(el);
    expect(hit).toMatchObject({
      name: 'SaveButton',
      framework: 'react',
      tpl: { file: 'src/components/SaveButton.tsx', line: 7 },
      props: { label: "'Salvar'", disabled: 'false', onClick: 'ƒ onClick' },
    });
    expect(hit!.props).not.toHaveProperty('children');
  });

  it('sem fiber, degrada para o hit do tagging', () => {
    document.body.innerHTML = '<div id="d"></div>';
    const el = document.getElementById('d')!;
    el.setAttribute(TAG_ATTR, formatTagValue({ file: 'src/Card.tsx', line: 2, column: 1 }));
    expect(reactAdapter.resolve(el)).toMatchObject({ name: 'Card' });
  });

  it('sem tagging, retorna null', () => {
    document.body.innerHTML = '<div id="solto"></div>';
    expect(reactAdapter.resolve(document.getElementById('solto')!)).toBeNull();
  });

  it('trunca valores longos e limita quantidade de props', () => {
    const muitasProps = Object.fromEntries(Array.from({ length: 14 }, (_, i) => [`p${i}`, 'x'.repeat(100)]));
    const el = makeButtonWithFiber(muitasProps);
    const hit = reactAdapter.resolve(el)!;
    expect(Object.keys(hit.props!)).toHaveLength(11); // 10 + marcador "…"
    expect(hit.props!['…']).toBe('+4 props');
    expect(hit.props!.p0!.length).toBeLessThanOrEqual(64);
  });
});
