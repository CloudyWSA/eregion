// withEregion — injects JSX tagging (data-eg-src) into both Next bundlers
// (webpack and Turbopack), dev only. It does not depend on the `next` package:
// the types below are structural (only the fields we touch).
import { findRepoRoot, readDaemonInfo } from '@eregion/config';

const LOADER = '@eregion/build/loader';

/** A webpack `module.rules` rule — only the fields we use. */
export interface WebpackRuleLike {
  test?: RegExp;
  exclude?: RegExp;
  enforce?: 'pre' | 'post';
  use?: unknown;
  [key: string]: unknown;
}

/** The webpack config passed to `nextConfig.webpack(config, context)`. */
export interface WebpackConfigLike {
  module?: { rules?: WebpackRuleLike[]; [key: string]: unknown };
  [key: string]: unknown;
}

/** Second argument of `nextConfig.webpack` (buildId, dev, isServer, ...). */
export interface WebpackContextLike {
  dev?: boolean;
  isServer?: boolean;
  [key: string]: unknown;
}

export type WebpackFn = (config: WebpackConfigLike, context: WebpackContextLike) => WebpackConfigLike;

/** A `turbopack.rules` rule (e.g. `'*.tsx'`). */
export interface TurbopackRuleLike {
  loaders: string[];
  [key: string]: unknown;
}

/** The stable `turbopack` key of next.config (Next >= 15.3). */
export interface TurbopackConfigLike {
  rules?: Record<string, TurbopackRuleLike>;
  [key: string]: unknown;
}

/**
 * Structural subset of `NextConfig` that `withEregion` touches. `next` is not a
 * dependency of this package — any object with this shape works.
 */
export interface NextConfigLike {
  webpack?: WebpackFn;
  turbopack?: TurbopackConfigLike;
  env?: Record<string, string>;
  [key: string]: unknown;
}

/**
 * Reads `.eregion/daemon.json` (if the daemon is up) and returns the public env
 * vars `EregionDevtools` uses to publish `window.__EREGION__`.
 *
 * Limitation: this runs once, when next.config loads — if the daemon starts
 * after `next dev`, restart `next dev` for the app to see the new port/token.
 */
function daemonEnv(): Record<string, string> {
  const info = readDaemonInfo(findRepoRoot(process.cwd()));
  if (!info) return {};
  return {
    NEXT_PUBLIC_EREGION_PORT: String(info.port),
    NEXT_PUBLIC_EREGION_TOKEN: info.token,
  };
}

function withWebpackRule(previous: WebpackFn | undefined): WebpackFn {
  return (config, context) => {
    const base = previous ? previous(config, context) : config;
    const rules = base.module?.rules ?? [];
    return {
      ...base,
      module: {
        ...base.module,
        rules: [
          ...rules,
          {
            test: /\.(t|j)sx$/,
            exclude: /node_modules/,
            enforce: 'pre',
            use: [{ loader: LOADER }],
          },
        ],
      },
    };
  };
}

/**
 * `next.config` wrapper: injects JSX tagging into both bundlers (webpack and
 * Turbopack) and publishes the daemon connection config via `env`. Dev only —
 * in production it returns `nextConfig` untouched, since tagging exposes repo paths.
 */
export function withEregion(nextConfig: NextConfigLike = {}): NextConfigLike {
  if (process.env.NODE_ENV === 'production') return nextConfig;

  return {
    ...nextConfig,
    webpack: withWebpackRule(nextConfig.webpack),
    turbopack: {
      ...nextConfig.turbopack,
      rules: {
        ...nextConfig.turbopack?.rules,
        '*.tsx': { loaders: [LOADER] },
        '*.jsx': { loaders: [LOADER] },
      },
    },
    env: {
      ...nextConfig.env,
      ...daemonEnv(),
    },
  };
}
