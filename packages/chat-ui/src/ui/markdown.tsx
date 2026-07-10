import type { ComponentChildren } from 'preact';

/**
 * Markdown mínimo para as respostas da IA — sem dependências e sem innerHTML
 * (tudo vira vnode, imune a XSS). Cobre o que aparece em resposta de dev:
 * código cercado com highlight, inline code, negrito/itálico, listas,
 * headings, links e cores hex com swatch.
 */

// ---------------------------------------------------------------------------
// Highlight de código (tokenizer único, keywords por linguagem)
// ---------------------------------------------------------------------------

const TS_KEYWORDS = new Set(
  ('const let var function return if else for while switch case break continue new class extends implements ' +
    'interface type enum import export from default async await try catch finally throw typeof instanceof in of ' +
    'this super null undefined true false void never any unknown string number boolean object public private ' +
    'protected readonly static get set as satisfies keyof infer is do yield delete').split(' '),
);
const CSS_KEYWORDS = new Set('important inherit initial unset auto none flex grid block inline absolute relative fixed sticky'.split(' '));
const BASH_KEYWORDS = new Set('if then else fi for do done while case esac function echo cd export return exit local set'.split(' '));

function keywordsFor(lang: string): Set<string> {
  if (['css', 'scss', 'less'].includes(lang)) return CSS_KEYWORDS;
  if (['bash', 'sh', 'shell', 'zsh'].includes(lang)) return BASH_KEYWORDS;
  return TS_KEYWORDS; // ts/tsx/js/jsx/json e default
}

const CODE_TOKEN = new RegExp(
  [
    String.raw`(?<comment>\/\/[^\n]*|\/\*[\s\S]*?\*\/|#(?![0-9a-fA-F]{3})[^\n]*)`,
    String.raw`(?<string>'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|` + '`(?:[^`\\\\]|\\\\.)*`)',
    String.raw`(?<hex>#[0-9a-fA-F]{3,8}\b)`,
    String.raw`(?<number>\b\d+(?:\.\d+)?(?:px|rem|em|%|s|ms|vh|vw)?\b)`,
    String.raw`(?<word>[A-Za-z_$][A-Za-z0-9_$-]*)`,
  ].join('|'),
  'g',
);

function isHexColor(text: string): boolean {
  const len = text.length - 1;
  return len === 3 || len === 4 || len === 6 || len === 8;
}

function Swatch({ hex }: { hex: string }) {
  return (
    <span class="eg-md-swatch-wrap">
      <span class="eg-md-swatch" style={{ background: hex }} />
      {hex}
    </span>
  );
}

export function highlightCode(code: string, lang: string): ComponentChildren[] {
  const keywords = keywordsFor(lang);
  const out: ComponentChildren[] = [];
  let last = 0;
  for (const m of code.matchAll(CODE_TOKEN)) {
    if (m.index! > last) out.push(code.slice(last, m.index));
    const g = m.groups!;
    if (g.comment) out.push(<span class="eg-tk-comment">{g.comment}</span>);
    else if (g.string) out.push(<span class="eg-tk-string">{g.string}</span>);
    else if (g.hex && isHexColor(g.hex)) out.push(<span class="eg-tk-string"><Swatch hex={g.hex} /></span>);
    else if (g.hex) out.push(g.hex);
    else if (g.number) out.push(<span class="eg-tk-number">{g.number}</span>);
    else if (g.word) {
      if (keywords.has(g.word)) out.push(<span class="eg-tk-keyword">{g.word}</span>);
      else if (g.word.charCodeAt(0) >= 65 && g.word.charCodeAt(0) <= 90) out.push(<span class="eg-tk-type">{g.word}</span>);
      else out.push(g.word);
    }
    last = m.index! + m[0].length;
  }
  if (last < code.length) out.push(code.slice(last));
  return out;
}

// ---------------------------------------------------------------------------
// Inline: `code`, **negrito**, *itálico*, [link](url), #hex
// ---------------------------------------------------------------------------

const INLINE_TOKEN = new RegExp(
  [
    String.raw`(?<code>\x60[^\x60\n]+\x60)`,
    String.raw`(?<bold>\*\*[^*\n]+\*\*)`,
    String.raw`(?<italic>\*[^*\n]+\*)`,
    String.raw`(?<link>\[[^\]\n]+\]\([^)\s]+\))`,
    String.raw`(?<hex>#[0-9a-fA-F]{3,8}\b)`,
  ].join('|'),
  'g',
);

export function renderInline(text: string): ComponentChildren[] {
  const out: ComponentChildren[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE_TOKEN)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    const g = m.groups!;
    if (g.code) {
      const inner = g.code.slice(1, -1);
      out.push(<code class="eg-md-code">{isHexColor(inner) && inner.startsWith('#') ? <Swatch hex={inner} /> : inner}</code>);
    } else if (g.bold) out.push(<strong>{renderInline(g.bold.slice(2, -2))}</strong>);
    else if (g.italic) out.push(<em>{renderInline(g.italic.slice(1, -1))}</em>);
    else if (g.link) {
      const cut = g.link.indexOf('](');
      const label = g.link.slice(1, cut);
      const href = g.link.slice(cut + 2, -1);
      out.push(
        <a class="eg-md-link" href={href} target="_blank" rel="noreferrer">
          {label}
        </a>,
      );
    } else if (g.hex && isHexColor(g.hex)) out.push(<Swatch hex={g.hex} />);
    else if (g.hex) out.push(g.hex);
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// ---------------------------------------------------------------------------
// Blocos: código cercado, listas, headings, parágrafos
// ---------------------------------------------------------------------------

type Block =
  | { kind: 'code'; lang: string; code: string; open: boolean }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'heading'; depth: number; text: string }
  | { kind: 'p'; text: string };

export function parseBlocks(text: string): Block[] {
  const lines = text.split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim().toLowerCase();
      const code: string[] = [];
      i += 1;
      let closed = false;
      while (i < lines.length) {
        if (lines[i]!.startsWith('```')) {
          closed = true;
          i += 1;
          break;
        }
        code.push(lines[i]!);
        i += 1;
      }
      // bloco ainda aberto = código chegando em streaming — renderiza igual
      blocks.push({ kind: 'code', lang, code: code.join('\n'), open: !closed });
      continue;
    }
    const listMatch = /^(\s*)([-*]|\d+[.)])\s+(.*)$/.exec(line);
    if (listMatch) {
      const ordered = listMatch[2]!.charCodeAt(0) >= 48 && listMatch[2]!.charCodeAt(0) <= 57;
      const items: string[] = [];
      while (i < lines.length) {
        const m = /^(\s*)([-*]|\d+[.)])\s+(.*)$/.exec(lines[i]!);
        if (!m) break;
        items.push(m[3]!);
        i += 1;
      }
      blocks.push({ kind: 'list', ordered, items });
      continue;
    }
    if (line.startsWith('#')) {
      let depth = 0;
      while (depth < line.length && line[depth] === '#') depth += 1;
      if (depth <= 4 && line[depth] === ' ') {
        blocks.push({ kind: 'heading', depth, text: line.slice(depth + 1) });
        i += 1;
        continue;
      }
    }
    if (line.trim() === '') {
      i += 1;
      continue;
    }
    const para: string[] = [line];
    i += 1;
    while (i < lines.length && lines[i]!.trim() !== '' && !lines[i]!.startsWith('```') && !lines[i]!.startsWith('#')) {
      const isList = /^(\s*)([-*]|\d+[.)])\s+/.test(lines[i]!);
      if (isList) break;
      para.push(lines[i]!);
      i += 1;
    }
    blocks.push({ kind: 'p', text: para.join('\n') });
  }
  return blocks;
}

export function Markdown({ text }: { text: string }) {
  const blocks = parseBlocks(text);
  return (
    <div class="eg-md">
      {blocks.map((b, i) => {
        switch (b.kind) {
          case 'code':
            return (
              <pre key={i} class="eg-md-pre" data-lang={b.lang || undefined}>
                {b.lang && <span class="eg-md-lang">{b.lang}</span>}
                <code>{highlightCode(b.code, b.lang)}</code>
              </pre>
            );
          case 'list': {
            const items = b.items.map((item, j) => <li key={j}>{renderInline(item)}</li>);
            return b.ordered ? <ol key={i} class="eg-md-list">{items}</ol> : <ul key={i} class="eg-md-list">{items}</ul>;
          }
          case 'heading':
            return <div key={i} class={`eg-md-h eg-md-h${b.depth}`}>{renderInline(b.text)}</div>;
          case 'p':
            return <p key={i} class="eg-md-p">{renderInline(b.text)}</p>;
        }
      })}
    </div>
  );
}
