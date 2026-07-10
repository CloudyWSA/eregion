import { describe, expect, it } from 'vitest';
import { formatTagValue, parseTagValue } from './source-tag.js';

describe('source-tag', () => {
  it('round-trip format → parse', () => {
    const ref = { file: 'src/components/Button.tsx', line: 42, column: 8 };
    expect(parseTagValue(formatTagValue(ref))).toEqual(ref);
  });

  it('parse rejeita valores malformados', () => {
    for (const ruim of ['', 'a.tsx', 'a.tsx:1', 'a.tsx:0:1', 'a.tsx:1:0', 'a.tsx:x:y', ':1:2']) {
      expect(parseTagValue(ruim)).toBeNull();
    }
  });

  it('aceita path com dois-pontos improváveis no meio', () => {
    expect(parseTagValue('src/a:b.tsx:3:5')).toEqual({ file: 'src/a:b.tsx', line: 3, column: 5 });
  });
});
