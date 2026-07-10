import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withEregion, type WebpackConfigLike, type WebpackContextLike, type WebpackRuleLike } from './with-eregion.js';

const LOADER = '@eregion/build/loader';

/** Cria um repo fake (.git) com/sem .eregion/daemon.json e aponta cwd pra lá. */
function fakeRepo(daemon?: { port: number; token: string }): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'eregion-next-test-'));
  mkdirSync(path.join(dir, '.git'));
  if (daemon) {
    mkdirSync(path.join(dir, '.eregion'));
    writeFileSync(
      path.join(dir, '.eregion', 'daemon.json'),
      JSON.stringify({ port: daemon.port, token: daemon.token, pid: 1234 }),
    );
  }
  return dir;
}

describe('withEregion', () => {
  const originalEnv = process.env.NODE_ENV;
  let tmpDirs: string[] = [];

  beforeEach(() => {
    tmpDirs = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env.NODE_ENV = originalEnv;
    for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
  });

  function withCwd(dir: string): void {
    tmpDirs.push(dir);
    vi.spyOn(process, 'cwd').mockReturnValue(dir);
  }

  it('em produção devolve o nextConfig intocado', () => {
    process.env.NODE_ENV = 'production';
    const original = { reactStrictMode: true };
    expect(withEregion(original)).toBe(original);
  });

  it('adiciona a rule de webpack preservando o webpack() do usuário', () => {
    process.env.NODE_ENV = 'development';
    withCwd(fakeRepo());

    const userRule: WebpackRuleLike = {
      test: /\.svg$/,
      use: ['svg-loader'],
    };
    const userWebpack = vi.fn((config: WebpackConfigLike, _ctx: WebpackContextLike): WebpackConfigLike => ({
      ...config,
      module: { ...config.module, rules: [...(config.module?.rules ?? []), userRule] },
    }));

    const result = withEregion({ webpack: userWebpack });
    const finalConfig = result.webpack!({ module: { rules: [] } }, { dev: true, isServer: false });

    expect(userWebpack).toHaveBeenCalled();
    const rules = finalConfig.module?.rules ?? [];
    expect(rules).toContainEqual(userRule);
    expect(rules.some((r) => String(r.test) === String(/\.(t|j)sx$/) && r.exclude?.toString() === /node_modules/.toString())).toBe(
      true,
    );
    const eregionRule = rules.find((r) => String(r.test) === String(/\.(t|j)sx$/));
    expect(eregionRule?.use).toEqual([{ loader: LOADER }]);
  });

  it('expõe turbopack.rules para *.tsx e *.jsx preservando config existente', () => {
    process.env.NODE_ENV = 'development';
    withCwd(fakeRepo());

    const result = withEregion({
      turbopack: { resolveAlias: { foo: 'bar' }, rules: { '*.svg': { loaders: ['svg-loader'] } } },
    });

    expect(result.turbopack?.resolveAlias).toEqual({ foo: 'bar' });
    expect(result.turbopack?.rules?.['*.svg']).toEqual({ loaders: ['svg-loader'] });
    expect(result.turbopack?.rules?.['*.tsx']).toEqual({ loaders: [LOADER] });
    expect(result.turbopack?.rules?.['*.jsx']).toEqual({ loaders: [LOADER] });
  });

  it('injeta env com porta/token quando .eregion/daemon.json existe', () => {
    process.env.NODE_ENV = 'development';
    withCwd(fakeRepo({ port: 4321, token: 'tok-abc' }));

    const result = withEregion({ env: { EXISTING: '1' } });

    expect(result.env).toEqual({
      EXISTING: '1',
      NEXT_PUBLIC_EREGION_PORT: '4321',
      NEXT_PUBLIC_EREGION_TOKEN: 'tok-abc',
    });
  });

  it('sem daemon.json não injeta env de eregion', () => {
    process.env.NODE_ENV = 'development';
    withCwd(fakeRepo());

    const result = withEregion({ env: { EXISTING: '1' } });

    expect(result.env).toEqual({ EXISTING: '1' });
  });
});
