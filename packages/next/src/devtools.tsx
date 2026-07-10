'use client';

// EregionDevtools — client component que monta o overlay de seleção e o
// chat da Eregion em dev. O dev adiciona <EregionDevtools /> no root layout.
//
// Diferente do Vite (onde `@eregion/build` injeta `window.__EREGION__` via
// <script> no index.html), no Next quem publica essa config é este próprio
// componente: `withEregion` lê `.eregion/daemon.json` no momento em que o
// next.config carrega e expõe porta/token via `env` (NEXT_PUBLIC_EREGION_*);
// este componente lê essas env vars no cliente e seta `window.__EREGION__`
// antes de montar overlay e chat.
//
// Limitação: as env vars são fixadas quando `next.config` carrega — se o
// daemon (`eregion-dev`) subir DEPOIS do `next dev`, o app não vê a porta e
// o token novos até que `next dev` seja reiniciado.
import { useEffect } from 'react';

interface EregionDaemonConfig {
  daemonPort: number;
  daemonToken: string;
  appName?: string;
}

// Cast local em vez de `declare global` — evita depender de carregar (mesmo
// que só para tipos) o `declare global` de `@eregion/overlay`, já que aqui a
// importação dela é sempre dinâmica.
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
