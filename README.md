# eregion ⟡

**Select a component in your running app, describe the change, and an AI edits the real source.** Hot-reload closes the loop, so you see the result in the same window in seconds.

<p align="center">
  <img src="docs/demo.gif" width="900" alt="Two components edited in parallel: the order cards get circular thumbnails while the sidebar gets a panel background, both applying live via hot-reload." />
</p>

<p align="center"><em>Two edits running in parallel: circular thumbnails on the cards, a panel background on the sidebar. Each is its own live session, and both land at once.</em></p>

Eregion is an open-source SDK. It drops a dev-only overlay into your app and connects it to a local daemon running a live [Claude Agent SDK](https://docs.claude.com/en/api/agent-sdk/overview) session, authenticated by your existing Claude Code login. Selecting a component costs no tokens: the message carries only compact references and the AI pulls what it needs through instrumentation tools, so a request costs about the size of your message, not the size of your codebase.

```
Alt+S    enter selection mode (⟡ shows in the taskbar)
click    select a component (Shift+click adds more)
type ↵   describe the change and press Enter
Esc      clear the selection or leave the mode
```

Each request becomes a **job** you watch live: the assistant's text and tool calls in order, file diffs with one-click **revert**, per-request cost, and a chat to keep iterating.

## What it can do

| Capability | How it works |
| --- | --- |
| **Edit components in parallel** | The daemon runs a pool of live sessions (2 by default, `--parallel N`). Select different components and fire requests that run at the same time without mixing. Extra jobs queue FIFO. |
| **Multiple versions of one edit** | Toggle **×N variants** in the command bar to generate 2 or 3 takes on the same request in parallel. Keep the one you like, revert the rest. |
| **Auto-run** | One toggle approves tool actions (Bash included) without prompts. Off by default. |
| **Full agent toolset** | The session has the Claude Code tools: **Bash**, file edits, `Glob`/`Grep`, `Task` subagents, `TodoWrite`. It can run your tests, install a dependency, or refactor across files. |
| **Skills & slash commands** | Any skill on your Claude Code account is available. Type `/` for a skill, `@` to mention another component, or paste an image. |
| **Backend traces** | With the Node/Bun agent installed, ask "what query is behind this?" and the AI answers from a real request trace (handler and SQL). |
| **Safe by default** | Edits inside the workspace apply automatically (the diff is an audit you can revert). Bash and edits outside the workspace ask first. Flip to **review** to approve every edit, or **auto-run** to approve all. |

## Principles

- **Lazy context.** Selecting spends no tokens. The AI pulls source and traces on demand through MCP tools, so it never greps your whole repo.
- **Warm sessions.** The daemon keeps sessions alive, so the prompt cache stays warm and replies are cheap.
- **Deterministic resolution.** Build-time tagging and static indexes map a DOM node to its source. The AI doesn't guess where a component lives.
- **Local only.** The daemon binds to `127.0.0.1` behind a per-session token. Nothing leaves your machine beyond the calls the Agent SDK already makes.

## Instrumentation tools the AI uses

The daemon exposes an in-process MCP server (`eregion`) so the model reaches for precise, cheap tools before touching your filesystem:

- `get_selection`: the components you currently have selected (name, `file:line`, summarized props, recent requests).
- `get_component_source`: a focused source window for a selected component, cheaper and more exact than `Grep`.
- `get_backend_trace`: the route, handler `file:line`, and DB queries (statement and duration) correlated to a selection.

## Getting started

**Prerequisite:** [Claude Code](https://docs.claude.com/en/docs/claude-code) installed and logged in. Eregion reuses that session, so there's no separate API key.

Run this in your app. It detects your framework, installs only the packages you need, updates `.gitignore`, and prints the exact wiring:

```bash
npm create eregion@latest       # or: pnpm create eregion · yarn create eregion · bun create eregion
```

Then start your dev server as usual. On Vite and Next.js the build plugin starts the daemon for you, so nothing runs on the side. Press **Alt+S** and you're editing.

> The plugin spawns the daemon once, reuses it across restarts, and stops it with your dev server. Pass `viteEregion({ parallel: 4 })` or `withEregion(config, { parallel: 4 })` for more concurrent sessions, `noDaemon: true` to manage it yourself, or run `npx eregion-dev` by hand.

### Manual setup

To wire it yourself, install the daemon and your framework's packages, add `.eregion/` to `.gitignore`, and follow your framework below. Everything is dev-only and becomes a no-op in production.

### Vite + React

```ts
// vite.config.ts
import { viteEregion } from '@eregion/build';
export default defineConfig({
  plugins: [viteEregion({ appName: 'my-app' }), react()],
  // on WSL under /mnt/c: watch: { usePolling: true }
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

### Next.js (App Router, webpack or Turbopack)

```ts
// next.config.ts
import { withEregion } from '@eregion/next';
export default withEregion(nextConfig);

// app/layout.tsx: <EregionDevtools /> inside the <body>
import { EregionDevtools } from '@eregion/next/devtools';

// instrumentation.ts (optional, enables backend traces)
import { registerEregionInstrumentation } from '@eregion/next/instrumentation';
export function register() { return registerEregionInstrumentation(); }
```

`withEregion` starts the daemon as `next.config` loads and publishes the connection env, so `next dev` is all you run.

### Angular

```ts
// main.ts (see packages/angular/README.md)
import { initEregion } from '@eregion/angular';
if (typeof ngDevMode !== 'undefined' && ngDevMode) void initEregion();
```

The daemon statically indexes your `@Component` decorators (no app build needed) and serves the index to the overlay. Angular has no build-plugin hook to spawn the daemon, so run it alongside `ng serve`: `npx eregion-dev` in a second terminal, or add it to your `dev` script with `concurrently`.

### Node / Bun backend (optional, request to query trace)

```ts
// at backend boot, before anything else (dev only, a no-op in production)
import { init } from '@eregion/node-agent';
init();
```

It instruments HTTP automatically and Express / pg / mysql2 / mongodb when present, then reports handler and SQL to the daemon so `get_backend_trace` can answer.

## Architecture

```
Browser (app in dev)                          Dev machine
┌────────────────────────────────┐   WS      ┌─────────────────────────────────┐
│ @eregion/overlay + adapters    │◄─────────►│ @eregion/daemon                 │
│ command bar + activity rail    │  token    │  pool of live Agent SDK sessions│
│ network patch (traceparent)    │           │  eregion MCP tools · permissions│
└──────────────┬─────────────────┘           │  Angular indexer · trace store  │
               ▼                             └──────────────┬──────────────────┘
Node/Bun/Next backend                                       │ edits the repo
┌────────────────────────────────┐  POST /trace/ingest      ▼
│ @eregion/node-agent (OTel)     │────────────────► hot-reload closes the loop
└────────────────────────────────┘
```

The daemon listens on `127.0.0.1`, on the first free port in `47100..47199`, and every connection must present the session token.

## Packages

| Package | Description |
| --- | --- |
| [`create-eregion`](packages/create-eregion) | `npm create eregion` scaffolder: detects your framework, installs only what's needed |
| [`@eregion/protocol`](packages/protocol) | Zod contract: selection payload, WS messages, source tags, traces |
| [`@eregion/overlay`](packages/overlay) | Selection engine and highlights, WS client, network patch, taskbar |
| [`@eregion/chat-ui`](packages/chat-ui) | Command bar, activity rail, job drawer, variants, approvals |
| [`@eregion/adapter-react`](packages/adapter-react) | Resolves component name and props via React fiber (falls back to tagging) |
| [`@eregion/adapter-angular`](packages/adapter-angular) | Resolution via `window.ng` and the daemon's index |
| [`@eregion/build`](packages/build) | `data-eg-src` JSX tagging (unplugin and Turbopack loader), config injection, daemon autostart |
| [`@eregion/next`](packages/next) | `withEregion(config)`, `<EregionDevtools/>`, instrumentation helper |
| [`@eregion/angular`](packages/angular) | `initEregion()`, dev-only |
| [`@eregion/node-agent`](packages/node-agent) | Programmatic OpenTelemetry (Node/Bun), traces to the daemon |
| [`@eregion/daemon`](packages/daemon) | `eregion-dev` CLI: session pool, MCP tools, permissions, indexer, traces |
| [`@eregion/config`](packages/config) | `findRepoRoot`, `.eregion/*` files |

## Try the demo

The repo ships a sample Vite + React app and a mock backend that fakes a real SQL query (with `db.*` span attributes):

```bash
pnpm install && pnpm build
./demo.sh                      # starts the daemon, the mock API, and the sample app
```

Open the app, fetch `http://localhost:3199/api/orders` from it, select the component that renders the result, and ask *"what query is behind this?"*.

## Roadmap: we're looking for contributors

Eregion is young and the surface area is wide. These are the directions we'd most love PRs for. Open an issue to claim one, or propose your own.

### Flagship: edit a shared component per usage, not just globally

A shared component like a `ChatCard` gets rendered all over the app with different props: a compact card in one place, an expanded one in another, an error state somewhere else. Same component, many faces. Today, selecting it edits the one source file, which changes **every** usage at once. We want Eregion to understand a component's real versions and let you edit just one:

- **Discover the component's call sites (usages):** the distinct prop configurations one shared component takes across the codebase and the running app. Figma calls these *instances*, Storybook calls them *stories*; in code they're **call sites**. The overlay already detects the sibling instances of the hovered component (`instancesOf` / `hoverKin`), which is the seed for a full usage inventory.
- **Show each usage as it actually renders**, so you pick the one you mean by looking at it.
- **Edit one specific usage without breaking the others.** Knowing every call site, the AI can add a variant prop, branch on it, or fork the usage safely, instead of editing the shared file and regressing the other places.
- **Promote a one-off usage into a first-class variant:** a named prop, a `cva`/variant map, or a generated Storybook story.

This turns *"edit the file"* into *"edit **this** version."*

### Other directions we'd merge

**Selection & preview**
- Live thumbnails for the `×N` variants: render each parallel version offscreen and pick the winner by sight.
- Before/after screenshots per edit, shown in the job card.
- Select by state (hover, open, loading, error) and edit that state.
- Select by words instead of clicks ("the primary button", "the third card").

**Editing power**
- Design-token awareness: detect the theme (CSS vars, Tailwind, a theme file) and route edits through it instead of hardcoded values.
- Responsive editing: select at a breakpoint, edit responsive styles, verify across viewports.
- Accessibility pass: audit the selection (contrast, roles, labels) and fix.
- Test generation: write or update tests for the edited component and run them.
- End-to-end edits over the backend trace: "add a field to this card" touching frontend and the query behind it.

**Frameworks & ecosystem**
- New adapters: Vue, Svelte, Solid, Qwik, Astro. (Today: React and Angular.)
- More build integrations: Remix, SvelteKit, Nuxt, Vite SSR.
- Editor bridge: jump from an edit to the file in VS Code / Cursor.

**Collaboration & delivery**
- Open a PR (branch per job) straight from a job's changes, not just a commit.
- A session timeline with grouped checkpoints and richer undo/redo.
- Shared sessions: more than one dev on the same running app.

**Intelligence**
- Project memory: learn the repo's conventions so edits match house style.
- Team-defined MCP tools: let projects expose their own instrumentation to the agent.
- Re-render and performance hints from the React profiler, with one-click fixes.

Have an idea that isn't here? That's exactly the kind of issue we want to read.

## Contributing

Eregion is a pnpm + Turborepo workspace (Node ≥ 20).

```bash
pnpm install
pnpm build          # build all packages (topological)
pnpm test           # vitest across the workspace
pnpm typecheck      # tsc --noEmit across the workspace

cd examples/vite-react && pnpm dev   # run the sample app (the plugin starts the daemon)
```

Issues and PRs are welcome. Keep changes focused, add or update tests alongside behavior changes, and run `pnpm test && pnpm typecheck` before opening a PR.

## License

MIT. See [LICENSE](LICENSE).
