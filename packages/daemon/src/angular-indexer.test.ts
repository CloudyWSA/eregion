import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AngularIndexer } from './angular-indexer.js';

let root: string;

const componentSrc = (selector: string) =>
  `import { Component } from '@angular/core';\n` +
  `@Component({ selector: '${selector}', templateUrl: './foo.component.html' })\n` +
  `export class FooComponent {}\n`;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'ng-idx-'));
  // Angular monorepo with two projects — reproduces the real cross-project collision.
  writeFileSync(
    join(root, 'angular.json'),
    JSON.stringify({
      projects: {
        'app-a': { root: 'projects/app-a', sourceRoot: 'projects/app-a/src' },
        'app-b': { root: 'projects/app-b', sourceRoot: 'projects/app-b/src' },
      },
    }),
  );
  const aDir = join(root, 'projects/app-a/src');
  const bDir = join(root, 'projects/app-b/src');
  mkdirSync(aDir, { recursive: true });
  mkdirSync(bDir, { recursive: true });

  writeFileSync(join(aDir, 'foo.component.ts'), componentSrc('app-foo'));
  writeFileSync(join(aDir, 'foo.component.html'), '<div>foo a</div>\n');
  // Collision: same className + selector in another project.
  writeFileSync(join(bDir, 'foo.component.ts'), componentSrc('app-foo'));
  writeFileSync(join(bDir, 'foo.component.html'), '<div>foo b</div>\n');

  writeFileSync(
    join(aDir, 'highlight.directive.ts'),
    `import { Directive } from '@angular/core';\n` +
      `@Directive({ selector: '[appHighlight]' })\n` +
      `export class HighlightDirective {}\n`,
  );

  // .spec.ts must be ignored by the scan.
  writeFileSync(
    join(aDir, 'foo.component.spec.ts'),
    `import { Component } from '@angular/core';\n` +
      `@Component({ selector: 'app-ignored' })\n` +
      `export class IgnoredComponent {}\n`,
  );
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('AngularIndexer', () => {
  it('indexes @Component/@Directive, ignores .spec and stamps the origin project', () => {
    const index = new AngularIndexer(root).build();

    expect(index.entries).toHaveLength(3); // 2× FooComponent + HighlightDirective
    expect(index.builtAtMs).toBeGreaterThan(0);

    const foos = index.entries.filter((e) => e.className === 'FooComponent');
    expect(foos).toHaveLength(2);
    for (const foo of foos) expect(foo.selector).toBe('app-foo');
    expect(new Set(foos.map((f) => f.project))).toEqual(new Set(['app-a', 'app-b']));

    const fooA = foos.find((f) => f.project === 'app-a')!;
    expect(fooA.src.file).toBe('projects/app-a/src/foo.component.ts');
    expect(fooA.src.line).toBe(3);
    expect(fooA.template?.file).toBe('projects/app-a/src/foo.component.html');

    expect(index.entries.some((e) => e.className === 'IgnoredComponent')).toBe(false);

    const directive = index.entries.find((e) => e.className === 'HighlightDirective')!;
    expect(directive.selector).toBe('[appHighlight]');
    expect(directive.project).toBe('app-a');
    expect(directive.template).toBeUndefined();
  });

  it('getIndex returns the same cached index while nothing changes', () => {
    const indexer = new AngularIndexer(root);
    const first = indexer.getIndex();
    const second = indexer.getIndex();
    expect(second.builtAtMs).toBe(first.builtAtMs);
    expect(second).toBe(first);
  });
});
