'use client';

// EregionDevtools — client component that mounts the selection overlay and the
// Eregion chat in dev. The developer adds <EregionDevtools /> to the root layout.
//
// In Next, this component publishes `window.__EREGION__` itself: `withEregion`
// reads `.eregion/daemon.json` when next.config loads and exposes port/token via
// `env` (NEXT_PUBLIC_EREGION_*), which this component reads on the client.
//
// Limitation: env vars are fixed when next.config loads — if the daemon starts
// AFTER `next dev`, the app won't see the new port/token until `next dev` restarts.
import { useEffect } from 'react';

interface EregionDaemonConfig {
  daemonPort: number;
  daemonToken: string;
  appName?: string;
}

// Local cast instead of `declare global` — avoids loading `@eregion/overlay`'s
// `declare global` (even just for types), since it is only imported dynamically here.
type WindowWithEregion = typeof globalThis & { __EREGION__?: EregionDaemonConfig };

function publishDaemonConfig(): void {
  if (typeof window === 'undefined') return;
  const port = process.env.NEXT_PUBLIC_EREGION_PORT;
  const token = process.env.NEXT_PUBLIC_EREGION_TOKEN;
  if (!port || !token) return;
  (window as WindowWithEregion).__EREGION__ = { daemonPort: Number(port), daemonToken: token };
}

export function EregionDevtools(): null {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;

    publishDaemonConfig();

    let cancelled = false;
    void (async () => {
      const [{ mount, registerAdapter }, { reactAdapter }, { mountChat }] = await Promise.all([
        import('@eregion/overlay'),
        import('@eregion/adapter-react'),
        import('@eregion/chat-ui'),
      ]);
      if (cancelled) return;
      registerAdapter(reactAdapter);
      const overlay = mount();
      if (overlay) mountChat(overlay);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
