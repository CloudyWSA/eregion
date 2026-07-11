// registerEregionInstrumentation — for Next's `instrumentation.ts`: starts the
// backend OTel agent (`@eregion/node-agent`) only on the Node runtime (not edge)
// and only in dev.
//
// `@eregion/node-agent` is NOT a dependency of this package — it's an optional
// peer. The import uses a variable specifier (not a string literal) on purpose so
// TypeScript won't try to resolve the module at typecheck time, since it may
// legitimately not be installed in the dev's app. Import failures are silent.
export async function registerEregionInstrumentation(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.NODE_ENV === 'production') return;

  const specifier = '@eregion/node-agent';
  try {
    const nodeAgent = (await import(specifier)) as { init?: () => void };
    nodeAgent.init?.();
  } catch {
    // @eregion/node-agent not installed — backend instrumentation is optional.
  }
}
