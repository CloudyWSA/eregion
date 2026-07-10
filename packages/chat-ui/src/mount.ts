import { h, render, Fragment } from 'preact';
import type { EngineState, EregionDevtoolsElement } from '@eregion/overlay';
import { JobStore } from './store.js';
import { Activity, type ActivityCallbacks } from './ui/activity.js';
import { CommandBar } from './ui/command-bar.js';
import { CHAT_CSS } from './ui/styles.js';

export const CHAT_TAG = 'eregion-chat';

/**
 * Fluxo principal: selecionar → prompt na command bar → job. O drawer é o
 * histórico (e chat livre, secundário). Compartilha o WS client e o engine
 * do overlay já montado.
 */
export function mountChat(overlay: EregionDevtoolsElement): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  const existing = document.querySelector(CHAT_TAG);
  if (existing) return existing as HTMLElement;

  if (!customElements.get(CHAT_TAG)) {
    customElements.define(CHAT_TAG, class extends HTMLElement {});
  }
  const host = document.createElement(CHAT_TAG);
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = CHAT_CSS;
  shadow.appendChild(style);

  const store = new JobStore();
  const client = overlay.client;
  client?.onMessage((msg) => store.handle(msg));

  const dispatch = (prompt: string): void => {
    const targets = overlay.engine.getState().selected.map((s) => s.name);
    const job = store.dispatch(prompt, targets.length > 0 ? targets : ['conversa']);
    client?.send({
      type: 'chat.send',
      payload: {
        text: prompt,
        attachSelection: targets.length > 0,
        jobId: job.jobId,
        ...(job.model ? { model: job.model } : {}),
      },
    });
    // O pedido virou job — a seleção cumpriu o papel e libera a próxima.
    overlay.engine.clear();
  };

  const callbacks: ActivityCallbacks = {
    onRevert(checkpointId) {
      client?.send({ type: 'changes.revert', payload: { checkpointId } });
    },
    onPermission(requestId, allow) {
      client?.send({ type: 'permission.respond', payload: { requestId, allow } });
      store.permissionResolved();
    },
    onFreeChat(text) {
      dispatch(text);
    },
  };

  const rerender = (ui = store.getState(), engine: EngineState = overlay.engine.getState()) => {
    render(
      h(Fragment, null, [
        h(CommandBar, {
          key: 'cmd',
          engine,
          models: ui.models,
          selectedModel: ui.selectedModel,
          onModelChange: (id: string) => store.setSelectedModel(id),
          onDispatch: dispatch,
        }),
        h(Activity, { key: 'act', state: ui, callbacks }),
      ]),
      shadow,
    );
  };
  store.subscribe((ui) => rerender(ui, overlay.engine.getState()));
  overlay.engine.subscribe((engine) => rerender(store.getState(), engine));

  return host;
}
