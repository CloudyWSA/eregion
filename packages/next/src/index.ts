// Next.js integration wiring build and overlay into a Next.js app.
export const PKG = '@eregion/next' as const;

export {
  withEregion,
  type NextConfigLike,
  type WebpackConfigLike,
  type WebpackContextLike,
  type WebpackFn,
  type WebpackRuleLike,
  type TurbopackConfigLike,
  type TurbopackRuleLike,
} from './with-eregion.js';
