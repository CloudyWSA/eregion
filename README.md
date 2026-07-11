# eregion ⟡

Open-source SDK for AI-driven visual editing of components: select components in your **running** app, describe the change in the command bar, and the AI edits the real source — hot-reload closes the loop. A local daemon keeps **one live session** of the Claude Agent SDK (authenticated by your Claude Code login) with instrumentation MCP tools, so each request costs ~the size of the message, not the whole context.

## How to use

```
Alt+S        enter selection mode (⟡ in the taskbar)
click        select a component · Shift+click adds to the selection
type ↵       the command bar opens with the selection — describe the change and Enter
Esc          clear the selection / exit the mode
```

Each request becomes a **job** in the activity rail (bottom-right corner). Click a job to open the drawer with history, diffs (with "revert"), per-request cost, and free-form chat.

## Per-app setup

Common prerequisite: the daemon running at the repo root (`npx eregion-dev`) **before** the dev server — it writes `.eregion/daemon.json` (port + token) that the build plugins inject into the dev bundle. Add `.eregion/` to the app's `.gitignore`.

### Vite + React

```ts
// vite.config.ts
import { viteEregion } from '@eregion/build';
export default defineConfig({
  plugins: [viteEregion({ appName: 'my-app' }), react()],
  // WSL on /mnt/c: watch: { usePolling: true }
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

// app/layout.tsx
import { EregionDevtools } from '@eregion/next/devtools';
// … <EregionDevtools /> inside the <body>

// instrumentation.ts (backend trace, optional)
import { registerEregionInstrumentation } from '@eregion/next/instrumentation';
export function register() { return registerEregionInstrumentation(); }
```

### Angular

```ts
// main.ts — see packages/angular/README.md
import { initEregion } from '@eregion/angular';
if (typeof ngDevMode !== 'undefined' && ngDevMode) void initEregion();
```

The daemon indexes the repo's `@Component` decorators (without touching the app build) and serves the index to the overlay.

### Node/Bun backend (request → query trace)

```ts
// at backend boot, before anything else (dev only — becomes a no-op in production)
import { init } from '@eregion/node-agent';
init();
```

With this, "what's the query behind this component?" works: the overlay injects `traceparent` into requests, the backend reports handler + SQL to the daemon, and the AI answers via `get_backend_trace` — without exploring the repo.

## Architecture

```
Browser (app in dev)                          Dev machine
┌────────────────────────────────┐   WS      ┌─────────────────────────────────┐
│ @eregion/overlay + adapters    │◄─────────►│ @eregion/daemon                 │
│ command bar + activity rail    │  token    │  live Claude Agent SDK session  │
│ network patch (traceparent)    │           │  instrumentation MCP tools      │
└──────────────┬─────────────────┘           │  Angular indexer · trace store  │
               ▼                             └──────────────┬──────────────────┘
Node/Bun/Next backend                                       │ edits the repos
┌────────────────────────────────┐  POST /trace/ingest      ▼
│ @eregion/node-agent (OTel)     │────────────────► hot-reload closes the loop
└────────────────────────────────┘
```

Principles: **lazy context** (selecting spends no tokens; the message carries only compact refs and the AI pulls details via MCP tools), **deterministic resolution** (build tagging + indexes; the AI does no exploratory grep), **one live session** (warm prompt cache across requests; jobs queue FIFO).

## Packages

| Package | Description |
| --- | --- |
| `@eregion/protocol` | Zod contract: selection payload, WS messages, source-tag, traces |
| `@eregion/overlay` | Selection (engine + highlights), WS client, network patch, taskbar |
| `@eregion/adapter-react` | Real name and props via fiber (falls back to tagging) |
| `@eregion/adapter-angular` | Resolution via `ng.*` + the daemon's index |
| `@eregion/build` | `data-eg-src` tagging (unplugin + Turbopack loader) and config injection |
| `@eregion/next` | `withEregion(config)`, `<EregionDevtools/>`, instrumentation helper |
| `@eregion/angular` | `initEregion()`, dev-only |
| `@eregion/node-agent` | Programmatic OTel (Node/Bun) → traces to the daemon |
| `@eregion/daemon` | `eregion-dev` CLI: live session, MCP tools, permissions, indexer, traces |
| `@eregion/chat-ui` | Command bar, activity rail, drawer, and approvals |
| `@eregion/config` | `findRepoRoot`, `.eregion/*` files |

## Development

```bash
pnpm install && pnpm build && pnpm -r test   # full workspace
cd examples/vite-react && pnpm dev           # sample app (daemon first: node packages/daemon/dist/cli.js)
```

## License

MIT — see [LICENSE](LICENSE).
