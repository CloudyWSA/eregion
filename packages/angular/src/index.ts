// @eregion/angular — integration for Angular apps. Does not depend on
// @angular/core: the app calls `initEregion()` in main.ts (after bootstrap), and
// we register the Angular adapter, mount overlay + chat, and ask the daemon for the index.
import { angularAdapter, loadAngularIndex } from '@eregion/adapter-angular';
import { mountChat } from '@eregion/chat-ui';
import { mount, registerAdapter, type MountOptions } from '@eregion/overlay';

export { angularAdapter, loadAngularIndex } from '@eregion/adapter-angular';

/**
 * Dev only: `ngDevMode` is set by Angular (tree-shaken in production builds) and
 * `window.ng` (debug API) only exists in dev — without them there's nothing to
 * inspect. The double guard keeps the overlay from mounting in production.
 */
function isDevEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as { ngDevMode?: unknown; ng?: unknown };
  return Boolean(w.ngDevMode) || typeof w.ng !== 'undefined';
}

/**
 * Entry point. Call once in main.ts, after bootstrapApplication:
 *
 *   import { initEregion } from '@eregion/angular';
 *   bootstrapApplication(AppComponent, appConfig).then(() => initEregion());
 *
 * Idempotent and a no-op outside dev.
 */
export async function initEregion(options: MountOptions = {}): Promise<void> {
  if (!isDevEnvironment()) return;

  // Priority > DOM fallback: the Angular adapter resolves first (window.ng).
  registerAdapter(angularAdapter);

  const overlay = mount(options);
  if (!overlay) return;
  mountChat(overlay);

  const client = overlay.client;
  if (!client) return;

  // Static index comes from the daemon (decorator parsing) — load into memory.
  client.onMessage((msg) => {
    if (msg.type === 'angular.index') loadAngularIndex(msg.payload.index);
  });
  client.send({ type: 'angular.index.get', payload: {} });
}
