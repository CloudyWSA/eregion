import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { TAG_ATTR } from '@eregion/protocol';
import { tagJsx } from './transform.js';

// root fixo para paths determinísticos nos testes
const ROOT = path.resolve('/tmp/fake-repo');
const file = (rel: string) => path.join(ROOT, rel);
const opts = { root: ROOT };

const APP = `export function App() {
  return (
    <main>
      <h1 className="title">Olá</h1>
      <Card />
      <Foo.Bar />
    </main>
  );
}
`;

describe('tagJsx', () => {
  it('tagueia tags host com path relativo e linha:coluna 1-based', async () => {
    const res = await tagJsx(APP, file('src/App.tsx'), opts);
    // <main> está na linha 3, coluna 5 (1-based)
    expect(res!.code).toContain(`${TAG_ATTR}="src/App.tsx:3:5"`);
    // <h1> na linha 4, coluna 7
    expect(res!.code).toContain(`${TAG_ATTR}="src/App.tsx:4:7"`);
  });

  it('não tagueia componentes nem member expressions', async () => {
    const res = await tagJsx(APP, file('src/App.tsx'), opts);
    expect(res!.code).not.toMatch(/<Card [^>]*data-eg-src/);
    expect(res!.code).not.toMatch(/<Foo\.Bar [^>]*data-eg-src/);
  });

  it('não duplica atributo existente', async () => {
    const code = `export const X = () => <div data-eg-src="ja/tem.tsx:1:1" />;`;
    const res = await tagJsx(code, file('src/X.tsx'), opts);
    expect(res!.code.match(/data-eg-src/g)).toHaveLength(1);
    expect(res!.code).toContain('ja/tem.tsx:1:1');
  });

  it('respeita exclude', async () => {
    const res = await tagJsx(APP, file('src/design-system/Button.tsx'), {
      ...opts,
      exclude: (rel) => rel.startsWith('src/design-system/'),
    });
    expect(res!.code).not.toContain(TAG_ATTR);
  });

  it('processa .jsx (sem TypeScript)', async () => {
    const res = await tagJsx(`export const Y = () => <span>oi</span>;`, file('src/Y.jsx'), opts);
    expect(res!.code).toContain(`${TAG_ATTR}="src/Y.jsx:1:24"`);
  });

  it('ignora arquivos que não são JSX e node_modules', async () => {
    expect(await tagJsx('const a = 1;', file('src/a.ts'), opts)).toBeNull();
    expect(await tagJsx(APP, file('node_modules/lib/App.tsx'), opts)).toBeNull();
  });

  it('preserva TypeScript (generics, tipos) sem quebrar', async () => {
    const code = `export function List<T>({ items }: { items: T[] }) {
  return <ul>{items.map((i, n) => <li key={n}>{String(i)}</li>)}</ul>;
}
`;
    const res = await tagJsx(code, file('src/List.tsx'), opts);
    expect(res!.code).toContain('items: T[]');
    expect(res!.code).toMatch(/<ul data-eg-src="src\/List\.tsx:2:10"/);
    expect(res!.code).toMatch(/<li key=\{n\} data-eg-src/);
  });

  it('emite sourcemap', async () => {
    const res = await tagJsx(APP, file('src/App.tsx'), opts);
    expect(res!.map).toBeTruthy();
  });
});
