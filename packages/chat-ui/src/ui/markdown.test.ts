// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { parseBlocks } from './markdown.js';

describe('parseBlocks', () => {
  it('separates paragraphs, fenced code and lists', () => {
    const text = 'Changed the button:\n\n```ts\nconst a: Color = \'#d08b5b\';\n```\n\n- borderRadius 12\n- subtle shadow\n\nDone.';
    const blocks = parseBlocks(text);
    expect(blocks.map((b) => b.kind)).toEqual(['p', 'code', 'list', 'p']);
    expect(blocks[1]).toMatchObject({ lang: 'ts', open: false, code: "const a: Color = '#d08b5b';" });
    expect(blocks[2]).toMatchObject({ ordered: false, items: ['borderRadius 12', 'subtle shadow'] });
  });

  it('still-open code (streaming) renders as an open block', () => {
    const blocks = parseBlocks('```tsx\nexport function Button() {');
    expect(blocks[0]).toMatchObject({ kind: 'code', lang: 'tsx', open: true });
  });

  it('headings up to #### become a heading; ordered list detected', () => {
    const blocks = parseBlocks('## Plan\n1. first\n2. second');
    expect(blocks[0]).toMatchObject({ kind: 'heading', depth: 2, text: 'Plan' });
    expect(blocks[1]).toMatchObject({ kind: 'list', ordered: true, items: ['first', 'second'] });
  });
});
