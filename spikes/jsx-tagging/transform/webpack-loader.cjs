/**
 * Webpack/Turbopack loader standalone que roda a MESMA transform babel
 * (babel-plugin-fc-src) sobre arquivos .tsx.
 *
 * Preserva JSX e tipos TS (parserOpts jsx+typescript, sem preset que faça
 * codegen) e apenas injeta o atributo. O SWC do Next compila o resto.
 */
const babel = require('@babel/core');
const fcSrcPlugin = require('./babel-plugin-fc-src.cjs');

module.exports = function fcSrcLoader(source) {
  const callback = this.async();
  const filename = this.resourcePath;

  babel.transform(
    source,
    {
      filename,
      babelrc: false,
      configFile: false,
      sourceMaps: false,
      parserOpts: { plugins: ['jsx', 'typescript'] },
      generatorOpts: { retainLines: true },
      plugins: [fcSrcPlugin],
    },
    (err, result) => {
      if (err) return callback(err);
      callback(null, result.code, result.map);
    }
  );
};
