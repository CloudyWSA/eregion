// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { parseBlocks } from './markdown.js';

describe('parseBlocks', () => {
  it('separa parágrafos, código cercado e listas', () => {
    const text = 'Mudei o botão:\n\n```ts\nconst a: Cor = \'#d08b5b\';\n```\n\n- borderRadius 12\n- sombra sutil\n\nPronto.';
    const blocks = parseBlocks(text);
    expect(blocks.map((b) => b.kind)).toEqual(['p', 'code', 'list', 'p']);
    expect(blocks[1]).toMatchObject({ lang: 'ts', open: false, code: "const a: Cor = '#d08b5b';" });
    expect(blocks[2]).toMatchObject({ ordered: false, items: ['borderRadius 12', 'sombra sutil'] });
  });

  it('código ainda aberto (streaming) renderiza como bloco aberto', () => {
    const blocks = parseBlocks('```tsx\nexport function Botao() {');
    expect(blocks[0]).toMatchObject({ kind: 'code', lang: 'tsx', open: true });
  });

  it('headings até #### viram heading; lista ordenada detectada', () => {
    const blocks = parseBlocks('## Plano\n1. primeiro\n2. segundo');
    expect(blocks[0]).toMatchObject({ kind: 'heading', depth: 2, text: 'Plano' });
    expect(blocks[1]).toMatchObject({ kind: 'list', ordered: true, items: ['primeiro', 'segundo'] });
  });
});
