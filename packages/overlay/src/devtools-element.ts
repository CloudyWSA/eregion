import { h, render } from 'preact';
import { registerAdapter } from './adapter.js';
import { domAdapter } from './dom-adapter.js';
import { installNetworkPatch, recentHttpActivity } from './network-patch.js';
import { SelectionEngine } from './selection-engine.js';
import { EregionClient, type EregionGlobal } from './ws-client.js';
import { OverlayApp } from './ui/overlay-app.js';
import { OVERLAY_CSS } from './ui/styles.js';

export interface MountOptions {
  /** App name shown to the daemon; default: window.__EREGION__.appName. */
  appName?: string;
  /** Daemon connection; default: window.__EREGION__ (injected by the build). */
  daemon?: Pick<EregionGlobal, 'daemonPort' | 'daemonToken'>;
}

export const DEVTOOLS_TAG = 'eregion-devtools';

export class EregionDevtoolsElement extends HTMLElement {
  engine = new SelectionEngine();
  client: EregionClient | null = null;
  options: MountOptions = {};
  private unsubscribe: (() => void) | null = null;

  connectedCallback(): void {
    registerAdapter(domAdapter);

    // Network patch: injects traceparent into the app's requests and feeds the
    // buffer the selection-engine attaches to the payload (frontend → backend trace).
    installNetworkPatch();
    this.engine.httpProvider = () => recentHttpActivity();

    const daemon = this.options.daemon ?? window.__EREGION__;
    if (daemon) {
      this.client = new EregionClient({ port: daemon.daemonPort, token: daemon.daemonToken });
      this.client.connect();
    }

    const shadow = this.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = OVERLAY_CSS;
    shadow.appendChild(style);
    render(h(OverlayApp, { engine: this.engine, client: this.client }), shadow);

    // Selection feeds the daemon cache; it never triggers the AI (lazy context).
    this.unsubscribe = this.engine.subscribe((state) => {
      if (!this.client) return;
      this.client.send({
        type: 'selection.update',
        payload: {
          payload: this.engine.buildPayload({
            framework: state.selected[0]?.framework ?? 'react',
            name: this.options.appName ?? window.__EREGION__?.appName,
            route: window.location.pathname,
          }),
        },
      });
    });

    window.addEventListener('keydown', this.onKeyDown);
  }

  disconnectedCallback(): void {
    this.unsubscribe?.();
    this.engine.disable();
    this.client?.close();
    window.removeEventListener('keydown', this.onKeyDown);
  }

  private onKeyDown = (ev: KeyboardEvent): void => {
    if (ev.altKey && ev.code === 'KeyS') {
      ev.preventDefault();
      this.engine.toggle();
    }
  };
}

export function mount(options: MountOptions = {}): EregionDevtoolsElement | null {
  if (typeof document === 'undefined') return null;
  if (!customElements.get(DEVTOOLS_TAG)) customElements.define(DEVTOOLS_TAG, EregionDevtoolsElement);
  const existing = document.querySelector<EregionDevtoolsElement>(DEVTOOLS_TAG);
  if (existing) return existing;
  const el = document.createElement(DEVTOOLS_TAG) as EregionDevtoolsElement;
  el.options = options;
  document.body.appendChild(el);
  return el;
}
