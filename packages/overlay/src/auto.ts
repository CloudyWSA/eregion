// Entry de efeito colateral: monta o overlay se o build dev injetou a config.
// É este módulo que o plugin de build importa no app em modo desenvolvimento.
import { mount } from './devtools-element.js';

if (typeof window !== 'undefined' && window.__EREGION__) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => mount(), { once: true });
  } else {
    mount();
  }
}
