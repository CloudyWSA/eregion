# Changesets

This folder is managed by [changesets](https://github.com/changesets/changesets). To record a change for the next release:

```bash
pnpm changeset
```

Pick the affected packages and a bump type; a markdown file lands here describing the change. All `@eregion/*` packages are versioned together (`fixed`), so one changeset bumps the whole set in lockstep.

To cut a release: `pnpm version-packages` (applies the changesets and bumps versions), then `pnpm release` (builds and publishes to npm via `pnpm publish`, which rewrites the `workspace:*` ranges to real versions).
