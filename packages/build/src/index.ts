// @eregion/build — tagging de source em JSX via unplugin (Vite/webpack/esbuild/rollup).
// Para Next+Turbopack, use o loader standalone: '@eregion/build/loader' em turbopack.rules.
import { createUnplugin } from 'unplugin';
import { findRepoRoot, readDaemonInfo } from '@eregion/config';
import { shouldProcess, tagJsx, type TagOptions } from './transform.js';

export const PKG = '@eregion/build' as const;
export { eregionTagPlugin, tagJsx, type TagOptions } from './transform.js';
export { findRepoRoot } from '@eregion/config';
export { TAG_ATTR } from '@eregion/protocol';

export interface BuildOptions extends TagOptions {
  /** Nome do app mostrado no daemon/chat; default: sem nome. */
  appName?: string;
}

/**
 * Script injetado no index.html em dev: publica a config de conexão com o
 * daemon (porta + token de .eregion/daemon.json) para o overlay encontrar.
 * Sem daemon rodando não injeta nada — o app funciona normalmente.
 */
function daemonConfigScript(appName?: string): string | null {
  const info = readDaemonInfo(findRepoRoot(process.cwd()));
  if (!info) return null;
  const config = { daemonPort: info.port, daemonToken: info.token, appName };
  return `window.__EREGION__ = ${JSON.stringify(config)};`;
}

export const EregionBuild = createUnplugin<BuildOptions | undefined>((options) => ({
  name: 'eregion-build',
  enforce: 'pre',
  transformInclude(id) {
    return shouldProcess(id.split('?')[0]!);
  },
  async transform(code, id) {
    return tagJsx(code, id.split('?')[0]!, options ?? {});
  },
  vite: {
    // Tagging expõe paths do repo — faz sentido apenas em dev.
    apply: 'serve',
    config() {
      return {
        // Os packages do SDK são workspace/dist e mudam fora do controle do
        // dep-optimizer — pré-bundlados, o browser roda versões velhas.
        optimizeDeps: {
          exclude: ['@eregion/overlay', '@eregion/chat-ui', '@eregion/adapter-react', '@eregion/adapter-angular'],
        },
      };
    },
    transformIndexHtml() {
      const script = daemonConfigScript(options?.appName);
      if (!script) return [];
      return [{ tag: 'script', children: script, injectTo: 'head' as const }];
    },
  },
}));

export const viteEregion = EregionBuild.vite;
export const webpackEregion = EregionBuild.webpack;
export const esbuildEregion = EregionBuild.esbuild;
export const rollupEregion = EregionBuild.rollup;
