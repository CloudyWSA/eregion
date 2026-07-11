// Side-effect entry: mounts the overlay when the dev build injected the config.
import { mount } from './devtools-element.js';

if (typeof window !== 'undefined' && window.__EREGION__) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => mount(), { once: true });
  } else {
    mount();
  }
}
