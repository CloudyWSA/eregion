/**
 * Babel visitor que injeta data-eg-src="<path>:<line>:<col>" em todo
 * JSXOpeningElement que seja tag HOST (nome começa com minúscula).
 *
 * SPIKE: sem opções, sem exclude configurável. path é relativo ao
 * process.cwd() (que, ao rodar o dev server, é o diretório do app),
 * produzindo valores como "src/App.tsx:5:4".
 * (Em produção o path seria relativo ao root do repo — ver RESULTADO.md.)
 */
const path = require('path');

module.exports = function fcSrcPlugin({ types: t }) {
  return {
    name: 'fc-src',
    visitor: {
      JSXOpeningElement(nodePath, state) {
        const nameNode = nodePath.node.name;
        // só JSXIdentifier simples (ignora <Foo.Bar/> e <ns:tag/>)
        if (!t.isJSXIdentifier(nameNode)) return;
        const tag = nameNode.name;
        // host elements: começam com minúscula (div, button, main...)
        if (!/^[a-z]/.test(tag)) return;

        const filename = (state.file && state.file.opts.filename) || '';
        if (!filename || filename.includes('node_modules')) return;

        // não duplica
        const already = nodePath.node.attributes.some(
          (a) => t.isJSXAttribute(a) && a.name && a.name.name === 'data-eg-src'
        );
        if (already) return;

        const loc = nodePath.node.loc;
        if (!loc || !loc.start) return;

        const rel = path
          .relative(process.cwd(), filename)
          .split(path.sep)
          .join('/');
        const value = `${rel}:${loc.start.line}:${loc.start.column}`;

        nodePath.node.attributes.push(
          t.jsxAttribute(t.jsxIdentifier('data-eg-src'), t.stringLiteral(value))
        );
      },
    },
  };
};
