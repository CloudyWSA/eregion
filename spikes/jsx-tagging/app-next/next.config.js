const path = require('path');

const loader = path.resolve(__dirname, '../transform/webpack-loader.cjs');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // --- Turbopack (next dev, default) ---
  // Chave estável `turbopack` existe a partir do Next 15.3.
  // (Antes disso era `experimental.turbo` — ver RESULTADO.md.)
  turbopack: {
    rules: {
      '*.tsx': {
        loaders: [loader],
      },
    },
  },

  // --- Webpack (next dev --no-turbopack) ---
  webpack(config) {
    config.module.rules.push({
      test: /\.tsx$/,
      exclude: /node_modules/,
      enforce: 'pre',
      use: [{ loader }],
    });
    return config;
  },
};

module.exports = nextConfig;
