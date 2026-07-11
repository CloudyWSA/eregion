import { tagJsx, type TagOptions } from './transform.js';

interface LoaderThis {
  resourcePath: string;
  async(): (err: Error | null, code?: string, map?: unknown) => void;
  getOptions?(): TagOptions;
}

/**
 * Standalone webpack loader — this is the module that goes in `turbopack.rules`
 * in next.config (Turbopack supports the simple sync/async subset of the loader
 * API; validated with Next 15.5).
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
