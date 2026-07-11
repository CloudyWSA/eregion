import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { TAG_ATTR } from '@eregion/protocol';
import { tagJsx } from './transform.js';

// fixed root for deterministic paths in tests
const ROOT = path.resolve('/tmp/fake-repo');
const file = (rel: string) => path.join(ROOT, rel);
const opts = { root: ROOT };

const APP = `export function App() {
  return (
    <main>
      <h1 className="title">Hello</h1>
      <Card />
      <Foo.Bar />
    </main>
  );
}
`;

describe('tagJsx', () => {
  it('tags host tags with a relative path and 1-based line:column', async () => {
    const res = await tagJsx(APP, file('src/App.tsx'), opts);
    // <main> is at line 3, column 5 (1-based)
    expect(res!.code).toContain(`${TAG_ATTR}="src/App.tsx:3:5"`);
    // <h1> at line 4, column 7
    expect(res!.code).toContain(`${TAG_ATTR}="src/App.tsx:4:7"`);
  });

  it('does not tag components or member expressions', async () => {
    const res = await tagJsx(APP, file('src/App.tsx'), opts);
    expect(res!.code).not.toMatch(/<Card [^>]*data-eg-src/);
    expect(res!.code).not.toMatch(/<Foo\.Bar [^>]*data-eg-src/);
  });

  it('does not duplicate an existing attribute', async () => {
    const code = `export const X = () => <div data-eg-src="already/has.tsx:1:1" />;`;
    const res = await tagJsx(code, file('src/X.tsx'), opts);
    expect(res!.code.match(/data-eg-src/g)).toHaveLength(1);
    expect(res!.code).toContain('already/has.tsx:1:1');
  });

  it('respects exclude', async () => {
    const res = await tagJsx(APP, file('src/design-system/Button.tsx'), {
      ...opts,
      exclude: (rel) => rel.startsWith('src/design-system/'),
    });
    expect(res!.code).not.toContain(TAG_ATTR);
  });

  it('processes .jsx (without TypeScript)', async () => {
    const res = await tagJsx(`export const Y = () => <span>hi</span>;`, file('src/Y.jsx'), opts);
    expect(res!.code).toContain(`${TAG_ATTR}="src/Y.jsx:1:24"`);
  });

  it('ignores non-JSX files and node_modules', async () => {
    expect(await tagJsx('const a = 1;', file('src/a.ts'), opts)).toBeNull();
    expect(await tagJsx(APP, file('node_modules/lib/App.tsx'), opts)).toBeNull();
  });

  it('preserves TypeScript (generics, types) without breaking', async () => {
    const code = `export function List<T>({ items }: { items: T[] }) {
  return <ul>{items.map((i, n) => <li key={n}>{String(i)}</li>)}</ul>;
}
`;
    const res = await tagJsx(code, file('src/List.tsx'), opts);
    expect(res!.code).toContain('items: T[]');
    expect(res!.code).toMatch(/<ul data-eg-src="src\/List\.tsx:2:10"/);
    expect(res!.code).toMatch(/<li key=\{n\} data-eg-src/);
  });

  it('emits a sourcemap', async () => {
    const res = await tagJsx(APP, file('src/App.tsx'), opts);
    expect(res!.map).toBeTruthy();
  });
});
