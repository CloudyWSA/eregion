import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withEregion, type WebpackConfigLike, type WebpackContextLike, type WebpackRuleLike } from './with-eregion.js';

const LOADER = '@eregion/build/loader';

/** Creates a fake repo (.git) with/without .eregion/daemon.json and points cwd at it. */
function fakeRepo(daemon?: { port: number; token: string }): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'eregion-next-test-'));
  mkdirSync(path.join(dir, '.git'));
  if (daemon) {
    mkdirSync(path.join(dir, '.eregion'));
    // pid = this test process → treated as a live daemon and reused (no spawn).
    writeFileSync(
      path.join(dir, '.eregion', 'daemon.json'),
      JSON.stringify({ port: daemon.port, token: daemon.token, pid: process.pid }),
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

  it('in production returns the nextConfig untouched', () => {
    process.env.NODE_ENV = 'production';
    const original = { reactStrictMode: true };
    expect(withEregion(original)).toBe(original);
  });

  it('adds the webpack rule while preserving the user webpack()', () => {
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

    const result = withEregion({ webpack: userWebpack }, { noDaemon: true });
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

  it('exposes turbopack.rules for *.tsx and *.jsx while preserving existing config', () => {
    process.env.NODE_ENV = 'development';
    withCwd(fakeRepo());

    const result = withEregion(
      { turbopack: { resolveAlias: { foo: 'bar' }, rules: { '*.svg': { loaders: ['svg-loader'] } } } },
      { noDaemon: true },
    );

    expect(result.turbopack?.resolveAlias).toEqual({ foo: 'bar' });
    expect(result.turbopack?.rules?.['*.svg']).toEqual({ loaders: ['svg-loader'] });
    expect(result.turbopack?.rules?.['*.tsx']).toEqual({ loaders: [LOADER] });
    expect(result.turbopack?.rules?.['*.jsx']).toEqual({ loaders: [LOADER] });
  });

  it('reuses a live daemon and injects its port/token as env', () => {
    process.env.NODE_ENV = 'development';
    withCwd(fakeRepo({ port: 4321, token: 'tok-abc' }));

    const result = withEregion({ env: { EXISTING: '1' } });

    expect(result.env).toEqual({
      EXISTING: '1',
      NEXT_PUBLIC_EREGION_PORT: '4321',
      NEXT_PUBLIC_EREGION_TOKEN: 'tok-abc',
    });
  });

  it('with noDaemon does not start a daemon or inject eregion env', () => {
    process.env.NODE_ENV = 'development';
    withCwd(fakeRepo());

    const result = withEregion({ env: { EXISTING: '1' } }, { noDaemon: true });

    expect(result.env).toEqual({ EXISTING: '1' });
  });
});
