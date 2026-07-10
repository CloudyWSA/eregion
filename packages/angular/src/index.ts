// @eregion/angular — integração para apps Angular. Não depende de @angular/core:
// o app chama `initEregion()` em main.ts (após bootstrap), e nós registramos o
// adapter Angular, montamos overlay + chat e pedimos o índice ao daemon.
import { angularAdapter, loadAngularIndex } from '@eregion/adapter-angular';
import { mountChat } from '@eregion/chat-ui';
import { mount, registerAdapter, type MountOptions } from '@eregion/overlay';

export { angularAdapter, loadAngularIndex } from '@eregion/adapter-angular';

/**
 * Só roda em dev: `ngDevMode` é definido pelo Angular (tree-shaken no build de
 * produção) e `window.ng` (API de debug) só existe em dev — sem eles não há o
 * que inspecionar. Guard duplo evita montar o overlay em produção.
 */
function isDevEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as { ngDevMode?: unknown; ng?: unknown };
  return Boolean(w.ngDevMode) || typeof w.ng !== 'undefined';
}

/**
 * Ponto de entrada. Chame uma vez no main.ts, depois do bootstrapApplication:
 *
 *   import { initEregion } from '@eregion/angular';
 *   bootstrapApplication(AppComponent, appConfig).then(() => initEregion());
 *
 * É idempotente e no-op fora de dev.
 */
export async function initEregion(options: MountOptions = {}): Promise<void> {
  if (!isDevEnvironment()) return;

  // Prioridade > fallback DOM: o adapter Angular resolve primeiro (window.ng).
  registerAdapter(angularAdapter);

  const overlay = mount(options);
  if (!overlay) return;
  mountChat(overlay);

  const client = overlay.client;
  if (!client) return;

  // Índice estático vem do daemon (parse dos decorators) — carrega em memória.
  client.onMessage((msg) => {
    if (msg.type === 'angular.index') loadAngularIndex(msg.payload.index);
  });
  client.send({ type: 'angular.index.get', payload: {} });
}
