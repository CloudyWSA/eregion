import { defineConfig } from 'tsup';

export default defineConfig([
  { entry: { index: 'src/index.ts', daemon: 'src/daemon-runner.ts' }, format: ['esm'], dts: true },
  // The loader must be CJS so webpack/Turbopack can require it.
  { entry: { loader: 'src/loader.ts' }, format: ['cjs'] },
]);
