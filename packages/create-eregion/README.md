# create-eregion

The fastest way to add [**eregion**](https://github.com/CloudyWSA/eregion) to your app — select a component in your running app, describe the change, and an AI edits the real source.

```bash
npm create eregion@latest
# or: pnpm create eregion · yarn create eregion · bun create eregion
```

It detects your framework (React, Vite + React, Next.js, or Angular) and your package manager, installs **only the packages that framework needs**, adds `.eregion/` to your `.gitignore`, and prints the exact wiring for your setup.

```bash
npm create eregion@latest ./my-app     # target another directory
```

Options:

| Flag | Purpose |
| --- | --- |
| `--framework <next\|vite-react\|react\|angular>` | skip framework detection |
| `--pm <pnpm\|yarn\|bun\|npm>` | force a package manager |
| `--skip-install` | wire things up without installing |

## License

MIT
