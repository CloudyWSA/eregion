import path from 'node:path';
import { transformAsync, types as t, type BabelFileResult, type PluginObj, type PluginPass } from '@babel/core';
// @ts-expect-error sem types publicados; plugin só de sintaxe
import syntaxJsx from '@babel/plugin-syntax-jsx';
// @ts-expect-error sem types publicados; plugin só de sintaxe
import syntaxTypescript from '@babel/plugin-syntax-typescript';
import { findRepoRoot } from '@eregion/config';
import { formatTagValue, TAG_ATTR } from '@eregion/protocol';

export interface TagOptions {
  /**
   * Base para os paths relativos gravados no atributo. Default: root do
   * repositório (primeiro diretório com .git subindo a partir do arquivo);
   * fallback process.cwd().
   */
  root?: string;
  /** Arquivos cujo path relativo satisfizer o predicado não são tagueados. */
  exclude?: (relPath: string) => boolean;
}

function isHostTag(tag: string): boolean {
  const first = tag.charCodeAt(0);
  return first >= 97 && first <= 122; // a-z: host element; maiúscula = componente
}

interface State extends PluginPass {
  opts: TagOptions;
}

/**
 * Injeta TAG_ATTR (contrato em @eregion/protocol) em todo JSXOpeningElement
 * de tag host. Componentes (<Card/>) e member expressions (<Foo.Bar/>) ficam
 * de fora: o call site deles já é tagueado no JSX do pai, que é onde o dev
 * quer editar. Linha/coluna 1-based (loc do Babel é 0-based em coluna).
 */
export function eregionTagPlugin(): PluginObj<State> {
  return {
    name: 'eregion-tag',
    visitor: {
      JSXOpeningElement(nodePath, state) {
        const nameNode = nodePath.node.name;
        if (nameNode.type !== 'JSXIdentifier') return;
        if (!isHostTag(nameNode.name)) return;

        const filename = state.file.opts.filename ?? '';
        if (!filename || filename.includes('node_modules')) return;

        const loc = nodePath.node.loc;
        if (!loc) return;

        const already = nodePath.node.attributes.some(
          (a) => a.type === 'JSXAttribute' && a.name.type === 'JSXIdentifier' && a.name.name === TAG_ATTR,
        );
        if (already) return;

        const root = state.opts.root ?? findRepoRoot(filename);
        const rel = path.relative(root, filename).split(path.sep).join('/');
        if (state.opts.exclude?.(rel)) return;

        const value = formatTagValue({ file: rel, line: loc.start.line, column: loc.start.column + 1 });
        nodePath.node.attributes.push(t.jsxAttribute(t.jsxIdentifier(TAG_ATTR), t.stringLiteral(value)));
      },
    },
  };
}

export function shouldProcess(file: string): boolean {
  return (file.endsWith('.tsx') || file.endsWith('.jsx')) && !file.includes('node_modules');
}

export async function tagJsx(
  code: string,
  filename: string,
  options: TagOptions = {},
): Promise<{ code: string; map: BabelFileResult['map'] } | null> {
  if (!shouldProcess(filename)) return null;
  const isTs = filename.endsWith('.tsx');
  const result = await transformAsync(code, {
    filename,
    sourceMaps: true,
    babelrc: false,
    configFile: false,
    parserOpts: { sourceType: 'module' },
    plugins: [
      isTs ? [syntaxTypescript, { isTSX: true }] : syntaxJsx,
      [eregionTagPlugin, options],
    ],
  });
  if (!result?.code) return null;
  return { code: result.code, map: result.map };
}
