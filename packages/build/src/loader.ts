import { tagJsx, type TagOptions } from './transform.js';

interface LoaderThis {
  resourcePath: string;
  async(): (err: Error | null, code?: string, map?: unknown) => void;
  getOptions?(): TagOptions;
}

/**
 * Webpack loader standalone — é este módulo que vai em `turbopack.rules` no
 * next.config (Turbopack suporta o subconjunto síncrono/assíncrono simples da
 * API de loaders; validado no spike jsx-tagging com Next 15.5).
 */
export default function eregionLoader(this: LoaderThis, source: string): void {
  const callback = this.async();
  tagJsx(source, this.resourcePath, this.getOptions?.() ?? {})
    .then((res) => {
      if (res) callback(null, res.code, res.map);
      else callback(null, source);
    })
    .catch((err: Error) => callback(err));
}
