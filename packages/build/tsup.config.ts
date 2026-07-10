import { defineConfig } from 'tsup';

export default defineConfig([
  { entry: { index: 'src/index.ts' }, format: ['esm'], dts: true },
  // Loader precisa ser CJS requerível pelo webpack/Turbopack.
  { entry: { loader: 'src/loader.ts' }, format: ['cjs'] },
]);
