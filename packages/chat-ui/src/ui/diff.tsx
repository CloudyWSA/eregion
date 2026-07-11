import type { ComponentChildren } from 'preact';
import { highlightCode } from './markdown.js';

function langFromFile(file: string): string {
  const dot = file.lastIndexOf('.');
  return dot > 0 ? file.slice(dot + 1) : '';
}

export function DiffView({ diff, file }: { diff: string; file: string }) {
  const lang = langFromFile(file);
  const rows: ComponentChildren[] = diff.split('\n').map((line, i) => {
    const kind = line.startsWith('+') ? 'add' : line.startsWith('-') ? 'del' : 'ctx';
    const body = kind === 'ctx' ? line : line.slice(1);
    return (
      <div key={i} class={`eg-diff-line eg-diff-${kind}`}>
        <span class="eg-diff-sign">{kind === 'add' ? '+' : kind === 'del' ? '−' : ' '}</span>
        <span class="eg-diff-code">{highlightCode(body, lang)}</span>
      </div>
    );
  });
  return <div class="eg-diff">{rows}</div>;
}
