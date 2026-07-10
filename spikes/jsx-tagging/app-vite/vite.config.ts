import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// mesma transform babel do loader do Next
const fcSrcPlugin = require('@spike/jsx-tagging-transform');

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [fcSrcPlugin],
      },
    }),
  ],
});
