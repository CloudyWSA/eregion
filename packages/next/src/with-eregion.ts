// withEregion — injeta o tagging de JSX (data-eg-src) nos dois bundlers do
// Next (webpack e Turbopack), apenas em dev. Não depende do pacote `next`:
// os tipos abaixo são estruturais (apenas os campos que tocamos).
import { findRepoRoot, readDaemonInfo } from '@eregion/config';

const LOADER = '@eregion/build/loader';

/** Regra de `module.rules` do webpack — só os campos que usamos. */
export interface WebpackRuleLike {
  test?: RegExp;
  exclude?: RegExp;
  enforce?: 'pre' | 'post';
  use?: unknown;
  [key: string]: unknown;
}

/** Config de webpack passada para `nextConfig.webpack(config, context)`. */
export interface WebpackConfigLike {
  module?: { rules?: WebpackRuleLike[]; [key: string]: unknown };
  [key: string]: unknown;
}

/** Segundo argumento de `nextConfig.webpack` (buildId, dev, isServer, ...). */
export interface WebpackContextLike {
  dev?: boolean;
  isServer?: boolean;
  [key: string]: unknown;
}

export type WebpackFn = (config: WebpackConfigLike, context: WebpackContextLike) => WebpackConfigLike;

/** Uma regra de `turbopack.rules` (ex: `'*.tsx'`). */
export interface TurbopackRuleLike {
  loaders: string[];
  [key: string]: unknown;
}

/** Chave estável `turbopack` do next.config (Next >= 15.3). */
export interface TurbopackConfigLike {
  rules?: Record<string, TurbopackRuleLike>;
  [key: string]: unknown;
}

/**
 * Subconjunto estrutural do `NextConfig` que `withEregion` toca. `next` não é
 * dependency deste pacote — qualquer objeto com este shape serve.
 */
export interface NextConfigLike {
  webpack?: WebpackFn;
  turbopack?: TurbopackConfigLike;
  env?: Record<string, string>;
  [key: string]: unknown;
}

/**
 * Lê `.eregion/daemon.json` (se o daemon estiver de pé) e devolve as env vars
 * públicas que `EregionDevtools` usa para publicar `window.__EREGION__`.
 *
 * Limitação: isto roda uma única vez, quando o `next.config` carrega — se o
 * daemon subir depois do `next dev`, é preciso reiniciar o `next dev` para o
 * app enxergar a porta/token novos.
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
 * Wrapper de `next.config`: injeta o tagging de JSX nos dois bundlers
 * (webpack e Turbopack) e publica a config de conexão com o daemon via
 * `env`. Apenas em dev — em produção devolve `nextConfig` intocado, pois o
 * tagging expõe paths do repo.
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
