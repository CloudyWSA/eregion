// @eregion/build — JSX source tagging via unplugin (Vite/webpack/esbuild/rollup).
// For Next+Turbopack, use the standalone loader: '@eregion/build/loader' in turbopack.rules.
import { createUnplugin } from 'unplugin';
import { findRepoRoot, readDaemonInfo } from '@eregion/config';
import { ensureDaemon } from './daemon-runner.js';
import { shouldProcess, tagJsx, type TagOptions } from './transform.js';

export const PKG = '@eregion/build' as const;
export { eregionTagPlugin, tagJsx, type TagOptions } from './transform.js';
export { findRepoRoot } from '@eregion/config';
export { TAG_ATTR } from '@eregion/protocol';
export { ensureDaemon, ensureDaemonSync, type DaemonRunnerOptions } from './daemon-runner.js';

export interface BuildOptions extends TagOptions {
  /** App name shown in the daemon/chat; default: no name. */
  appName?: string;
  /** Cross-origin backends that accept the traceparent header. */
  traceOrigins?: string[];
  /** Max parallel AI sessions when the plugin starts the daemon; default 2. */
  parallel?: number;
  /** Skip starting the daemon (run `npx eregion-dev` yourself). */
  noDaemon?: boolean;
}

/**
 * Script injected into index.html in dev: publishes the daemon connection
 * config (port + token from .eregion/daemon.json) for the overlay to find.
 * Injects nothing when no daemon is running — the app works normally.
 */
function daemonConfigScript(options?: BuildOptions): string | null {
  const info = readDaemonInfo(findRepoRoot(process.cwd()));
  if (!info) return null;
  const config = {
    daemonPort: info.port,
    daemonToken: info.token,
    appName: options?.appName,
    traceOrigins: options?.traceOrigins,
  };
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
    // Tagging exposes repo paths — only makes sense in dev.
    apply: 'serve',
    config() {
      return {
        // SDK packages are workspace/dist and change outside the dep-optimizer's
        // control — if pre-bundled, the browser runs stale versions.
        optimizeDeps: {
          exclude: ['@eregion/overlay', '@eregion/chat-ui', '@eregion/adapter-react', '@eregion/adapter-angular'],
        },
      };
    },
    // Start the daemon with the dev server (like any library — the user just
    // runs their project). Awaited so daemon.json exists before the first request.
    async configureServer(server: { config: { logger: { info(msg: string): void } } }) {
      if (options?.noDaemon) return;
      try {
        await ensureDaemon({
          parallel: options?.parallel,
          log: (msg) => server.config.logger.info(`⟡ eregion: ${msg}`),
        });
      } catch {
        // never let a daemon hiccup break the dev server
      }
    },
    transformIndexHtml() {
      const script = daemonConfigScript(options);
      if (!script) return [];
      return [{ tag: 'script', children: script, injectTo: 'head' as const }];
    },
  },
}));

export const viteEregion = EregionBuild.vite;
export const webpackEregion = EregionBuild.webpack;
export const esbuildEregion = EregionBuild.esbuild;
export const rollupEregion = EregionBuild.rollup;
