# Spike 1 — tagging JSX cross-bundler (`data-eg-src`)

> **Nota (rename pós-execução):** este spike foi executado e validado originalmente
> com o atributo `data-fc-src` (era `field-sdk`). O projeto foi renomeado para
> **Eregion** depois da execução, e este documento — junto com o código da
> transform — foi atualizado para `data-eg-src` **apenas por consistência de
> nomenclatura**, sem re-executar o spike. Os outputs de `curl`/build abaixo são o
> registro histórico real da execução (que produziu `data-fc-src` em runtime); o
> comportamento validado não muda com o rename.

**Objetivo:** provar que uma transform de build injeta
`data-eg-src="<path>:<linha>:<coluna>"` em todo elemento JSX **host** (tags
minúsculas) e que o atributo chega ao DOM/HTML nos 3 bundlers alvo.

**Veredito:** ✅ **Vite** · ✅ **Next + webpack** · ✅ **Next + Turbopack** (incl. Server Components).
A técnica é viável nos três. Nenhum fallback necessário.

## Versões exatas (medidas neste ambiente)

| pacote | versão |
|---|---|
| next | 15.5.20 |
| react / react-dom | 19.2.7 |
| vite | 5.4.21 |
| @vitejs/plugin-react | 4.7.0 |
| @babel/core | 7.29.7 |
| node | 22.22.3 · pnpm 9.12.0 |

## A transform (compartilhada)

`transform/babel-plugin-fc-src.cjs` — visitor único sobre `JSXOpeningElement`:
- só `JSXIdentifier` cujo nome começa com **minúscula** (host: `div`, `button`, `main`…);
  ignora componentes (`<Card/>`, `<ClientButton/>`), `<Foo.Bar/>` e `<ns:tag/>`;
- ignora arquivos em `node_modules`;
- não duplica se `data-eg-src` já existir;
- valor = `path.relative(process.cwd(), filename)` + `:linha:coluna` de `node.loc.start`.

O **mesmo** plugin é consumido por dois caminhos:
- **Vite:** via `babel.plugins` do `@vitejs/plugin-react` (`app-vite/vite.config.ts`).
- **Next (webpack + turbopack):** via `transform/webpack-loader.cjs`, um loader
  standalone que roda `@babel/core` com `parserOpts: { plugins: ['jsx','typescript'] }`
  (preserva JSX + tipos, só injeta o atributo; o SWC do Next compila o resto).

Notas de precisão do valor injetado:
- **coluna é 0-based** (convenção do `node.loc` do Babel). Ex.: `<main>` indentado
  com 4 espaços na linha 5 → `App.tsx:5:4`.
- **path relativo ao `process.cwd()`** (= diretório do app ao rodar o dev server),
  produzindo `src/App.tsx` / `app/page.tsx`. **Em produção** a resolução
  componente→arquivo vai querer path relativo ao **root do repo**; trocar a base em
  1 linha. Para Vite, produção usará **unplugin** (não o `babel` do plugin-react).

---

## Setup 1 — Vite + React 19 ✅

Vite é SPA client-only: o HTML servido (`index.html`) é estático e só referencia
`/src/main.tsx`. A evidência real é o **módulo transformado** que o dev server de
fato entrega ao browser (pipeline plugin-react → esbuild). `data-*` em host element
é aplicado ao DOM pelo React sem alteração.

```
$ curl -s http://localhost:5199/src/App.tsx | grep data-fc-src
  return /* @__PURE__ */ jsxDEV("main", { "data-fc-src": "src/App.tsx:5:4", children: [
    /* @__PURE__ */ jsxDEV("h1", { "data-fc-src": "src/App.tsx:6:6", children: "Spike Vite fc-src" }, ...

$ curl -s http://localhost:5199/src/Card.tsx | grep data-fc-src
  return /* @__PURE__ */ jsxDEV("div", { className: "card", "data-fc-src": "src/Card.tsx:6:4", children: [
    /* @__PURE__ */ jsxDEV("p", { "data-fc-src": "src/Card.tsx:7:6", children: title }, ...
    /* @__PURE__ */ jsxDEV("button", { onClick: () => setN((v) => v + 1), "data-fc-src": "src/Card.tsx:8:6", ...
```

`<Card/>` (componente, maiúsculo) **não** recebeu o atributo — comportamento correto.

---

## Setup 2 — Next 15 + webpack ✅

`next dev` (webpack é o default no 15.5; ver "Limitações" sobre `--no-turbopack`).
Loader registrado em `next.config.js` via `webpack(config)` com
`{ test: /\.tsx$/, exclude: /node_modules/, enforce: 'pre', use: [{ loader }] }`
(`enforce: 'pre'` para rodar **antes** do SWC).

HTML **servido pelo servidor** (curl → SSR, http 200):

```
$ curl -s http://localhost:3199/ | grep -oE 'data-fc-src="[^"]*"' | sort -u
data-fc-src="app/ClientButton.tsx:9:4"
data-fc-src="app/layout.tsx:9:4"
data-fc-src="app/layout.tsx:10:6"
data-fc-src="app/page.tsx:6:4"
data-fc-src="app/page.tsx:7:6"
data-fc-src="app/page.tsx:8:6"

$ ... | grep -oE '<main[^>]*>'
<main id="server-root" data-fc-src="app/page.tsx:6:4">     # Server Component
$ ... | grep -oE '<button[^>]*>'
<button id="client-btn" data-fc-src="app/ClientButton.tsx:9:4">   # Client Component
```

`page.tsx` (Server Component, sem `'use client'`) e `ClientButton.tsx`
(Client Component) **ambos** taggeados no HTML servido.

---

## Setup 3 — Next 15 + Turbopack ✅  (inclui RSC)

`next dev --turbopack`. Loader registrado no next.config via a chave **estável**
`turbopack.rules` (sintaxe correta para o Next 15.5 instalado):

```js
turbopack: { rules: { '*.tsx': { loaders: [<abs path>/webpack-loader.cjs] } } }
```

Turbopack aceitou a config sem warning/erro e aplicou o **mesmo** webpack-loader
standalone. HTML servido (curl → 200):

```
$ curl -s http://localhost:3199/ | grep -oE 'data-fc-src="[^"]*"' | sort -u
data-fc-src="app/ClientButton.tsx:9:4"
data-fc-src="app/layout.tsx:9:4"
data-fc-src="app/layout.tsx:10:6"
data-fc-src="app/page.tsx:6:4"
data-fc-src="app/page.tsx:7:6"
data-fc-src="app/page.tsx:8:6"

$ ... | grep -oE '<main[^>]*>'
<main id="server-root" data-fc-src="app/page.tsx:6:4">     # Server Component — atravessou o wire RSC
$ ... | grep -oE '<button[^>]*>'
<button id="client-btn" data-fc-src="app/ClientButton.tsx:9:4">   # Client Component
```

**RSC:** o atributo do Server Component chega ao HTML servido — como é apenas uma
prop de host element, atravessa o render RSC trivialmente. Confirmado idêntico ao
webpack.

---

## Limitações / achados (relevantes para produção)

1. **`--no-turbopack` não existe no Next 15.5.** O flag do brief foi rejeitado
   (`unknown option '--no-turbopack' (Did you mean --turbopack?)`). Nesta versão o
   **webpack é o default** de `next dev`; Turbopack é **opt-in** via `--turbopack`.
   Scripts: `dev:webpack` = `next dev`, `dev:turbo` = `next dev --turbopack`.
2. **Chave de config do Turbopack:** no 15.5 é a estável **`turbopack`** (top-level),
   não `experimental.turbo` (essa era a forma pré-15.3). Usar `experimental.turbo`
   aqui emitiria deprecation.
3. **Coluna 0-based** e **path relativo ao cwd** — ver "Notas de precisão" acima.
   Ambos são decisões a fixar no design real (provavelmente 1-based + root do repo).
4. **Perf em `/mnt/c` (WSL):** primeira compilação de rota levou **~85s (webpack)** e
   **~116s (turbopack)**; boot ~60s. Não é limitação da técnica, é o filesystem.
   Requer timeouts generosos ao verificar.
5. **TS auto-setup do Next:** no 1º boot o Next detecta TSX e roda um
   `pnpm add -D @types/react` + cria `tsconfig.json`/`next-env.d.ts`, abortando o
   boot. Precisa de um 2º start. (Já resolvido — arquivos commitados.)
6. **Vite:** a validação foi feita no módulo transformado servido pelo dev server
   (não há SSR para curl). Produção usará **unplugin** em vez do babel do
   plugin-react — a transform (o visitor) é a mesma, muda só o adaptador.

## Como reproduzir

```
pnpm install                     # na raiz do monorepo
# Vite:
pnpm --filter @spike/app-vite dev        # :5199  → curl /src/App.tsx
# Next webpack:
pnpm --filter @spike/app-next dev:webpack # :3199 → curl /  (esperar compile)
# Next turbopack:
pnpm --filter @spike/app-next dev:turbo   # :3199 → curl /
```
