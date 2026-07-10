# eregion ⟡

SDK open source para edição visual de componentes com IA: selecione componentes na aplicação **rodando**, descreva a mudança na barra de comando, e a IA edita o código-fonte real — o hot-reload fecha o ciclo. Um daemon local mantém **uma sessão viva** do Claude Agent SDK (autenticada pelo seu login do Claude Code) com ferramentas MCP de instrumentação, então cada pedido custa ~o tamanho da mensagem, não o contexto inteiro.

## Como usar

```
Alt+S        entra no modo seleção (⟡ na taskbar)
clique       seleciona um componente · Shift+clique adiciona à seleção
digite ↵     a command bar aparece com a seleção — descreva a mudança e Enter
Esc          limpa a seleção / sai do modo
```

Cada pedido vira um **job** na activity rail (canto inferior direito). Clique num job para abrir o drawer com histórico, diffs (com "reverter"), custo por pedido e chat livre.

## Setup por app

Pré-requisito comum: daemon rodando na raiz do repo (`npx eregion-dev`) **antes** do dev server — ele grava `.eregion/daemon.json` (porta + token) que os plugins de build injetam no bundle dev. Adicione `.eregion/` ao `.gitignore` do app.

### Vite + React

```ts
// vite.config.ts
import { viteEregion } from '@eregion/build';
export default defineConfig({
  plugins: [viteEregion({ appName: 'meu-app' }), react()],
  // WSL em /mnt/c: watch: { usePolling: true }
});

// main.tsx (dev only)
if (import.meta.env.DEV) {
  void import('@eregion/overlay').then(async ({ mount, registerAdapter }) => {
    registerAdapter((await import('@eregion/adapter-react')).reactAdapter);
    const overlay = mount();
    if (overlay) (await import('@eregion/chat-ui')).mountChat(overlay);
  });
}
```

### Next.js (App Router, webpack ou Turbopack)

```ts
// next.config.ts
import { withEregion } from '@eregion/next';
export default withEregion(nextConfig);

// app/layout.tsx
import { EregionDevtools } from '@eregion/next/devtools';
// … <EregionDevtools /> dentro do <body>

// instrumentation.ts (rastro de backend, opcional)
import { registerEregionInstrumentation } from '@eregion/next/instrumentation';
export function register() { return registerEregionInstrumentation(); }
```

### Angular

```ts
// main.ts — consulte packages/angular/README.md
import { initEregion } from '@eregion/angular';
if (typeof ngDevMode !== 'undefined' && ngDevMode) void initEregion();
```

O daemon indexa os decorators `@Component` do repo (sem tocar no build do app) e serve o índice ao overlay.

### Backend Node/Bun (rastro request → query)

```ts
// no boot do backend, antes de tudo (dev only — vira no-op em produção)
import { init } from '@eregion/node-agent';
init();
```

Com isso, "qual a query desse componente?" funciona: o overlay injeta `traceparent` nas requests, o backend reporta handler + SQL ao daemon, e a IA responde via `get_backend_trace` — sem explorar o repo.

## Arquitetura

```
Browser (app em dev)                          Máquina do dev
┌────────────────────────────────┐   WS      ┌─────────────────────────────────┐
│ @eregion/overlay + adapters    │◄─────────►│ @eregion/daemon                 │
│ command bar + activity rail    │  token    │  sessão viva Claude Agent SDK   │
│ network patch (traceparent)    │           │  MCP tools de instrumentação    │
└──────────────┬─────────────────┘           │  indexer Angular · trace store  │
               ▼                             └──────────────┬──────────────────┘
Backend Node/Bun/Next                                       │ edita os repos
┌────────────────────────────────┐  POST /trace/ingest      ▼
│ @eregion/node-agent (OTel)     │────────────────► hot-reload fecha o ciclo
└────────────────────────────────┘
```

Princípios: **contexto lazy** (selecionar não gasta token; a mensagem leva só refs compactas e a IA puxa detalhes via MCP tools), **resolução determinística** (tagging de build + índices; a IA não faz grep exploratório), **uma sessão viva** (prompt cache quente entre pedidos; jobs enfileiram em FIFO).

## Packages

| Package | Descrição |
| --- | --- |
| `@eregion/protocol` | Contrato Zod: payload de seleção, mensagens WS, source-tag, traces |
| `@eregion/overlay` | Seleção (engine + highlights), WS client, network patch, taskbar |
| `@eregion/adapter-react` | Nome real e props via fiber (degrada para o tagging) |
| `@eregion/adapter-angular` | Resolução via `ng.*` + índice do daemon |
| `@eregion/build` | Tagging `data-eg-src` (unplugin + loader Turbopack) e injeção da config |
| `@eregion/next` | `withEregion(config)`, `<EregionDevtools/>`, helper de instrumentation |
| `@eregion/angular` | `initEregion()` dev-only |
| `@eregion/node-agent` | OTel programático (Node/Bun) → traces para o daemon |
| `@eregion/daemon` | CLI `eregion-dev`: sessão viva, MCP tools, permissões, indexer, traces |
| `@eregion/chat-ui` | Command bar, activity rail, drawer e aprovações |
| `@eregion/config` | `findRepoRoot`, arquivos `.eregion/*` |

## Desenvolvimento

```bash
pnpm install && pnpm build && pnpm -r test   # workspace completo
cd examples/vite-react && pnpm dev           # app cobaia (daemon antes: node packages/daemon/dist/cli.js)
```

## Licença

MIT — veja [LICENSE](LICENSE).
