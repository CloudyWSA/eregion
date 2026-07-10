import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { viteEregion } from '@eregion/build';

export default defineConfig({
  plugins: [viteEregion({ appName: 'example-vite-react' }), react()],
  server: {
    // /mnt/c no WSL não emite eventos de arquivo — sem polling o hot-reload não dispara.
    watch: { usePolling: true, interval: 300 },
  },
});
