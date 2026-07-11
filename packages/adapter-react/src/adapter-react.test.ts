// @vitest-environment jsdom
import { formatTagValue, TAG_ATTR } from '@eregion/protocol';
import { describe, expect, it } from 'vitest';
import { reactAdapter } from './index.js';
import type { FiberNode } from './fiber.js';

function makeButtonWithFiber(props: Record<string, unknown>): HTMLElement {
  document.body.innerHTML = '<button id="target">Save</button>';
  const el = document.getElementById('target')!;
  el.setAttribute(TAG_ATTR, formatTagValue({ file: 'src/components/SaveButton.tsx', line: 7, column: 3 }));
  function SaveButton() {}
  const componentFiber: FiberNode = { type: SaveButton, return: null, memoizedProps: props };
  const hostFiber: FiberNode = { type: 'button', return: componentFiber, memoizedProps: null };
  Object.defineProperty(el, '__reactFiber$test', { value: hostFiber, enumerable: true });
  return el;
}

describe('reactAdapter', () => {
  it('enriches the tagging hit with the real name and fiber props', () => {
    const el = makeButtonWithFiber({
      label: 'Save',
      disabled: false,
      onClick: function onClick() {},
      children: 'never shows',
    });
    const hit = reactAdapter.resolve(el);
    expect(hit).toMatchObject({
      name: 'SaveButton',
      framework: 'react',
      tpl: { file: 'src/components/SaveButton.tsx', line: 7 },
      props: { label: "'Save'", disabled: 'false', onClick: 'ƒ onClick' },
    });
    expect(hit!.props).not.toHaveProperty('children');
  });

  it('without a fiber, degrades to the tagging hit', () => {
    document.body.innerHTML = '<div id="d"></div>';
    const el = document.getElementById('d')!;
    el.setAttribute(TAG_ATTR, formatTagValue({ file: 'src/Card.tsx', line: 2, column: 1 }));
    expect(reactAdapter.resolve(el)).toMatchObject({ name: 'Card' });
  });

  it('without tagging, returns null', () => {
    document.body.innerHTML = '<div id="loose"></div>';
    expect(reactAdapter.resolve(document.getElementById('loose')!)).toBeNull();
  });

  it('truncates long values and caps the number of props', () => {
    const manyProps = Object.fromEntries(Array.from({ length: 14 }, (_, i) => [`p${i}`, 'x'.repeat(100)]));
    const el = makeButtonWithFiber(manyProps);
    const hit = reactAdapter.resolve(el)!;
    expect(Object.keys(hit.props!)).toHaveLength(11); // 10 + the "…" marker
    expect(hit.props!['…']).toBe('+4 props');
    expect(hit.props!.p0!.length).toBeLessThanOrEqual(64);
  });
});
