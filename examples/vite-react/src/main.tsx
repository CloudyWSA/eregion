import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if (import.meta.env.DEV) {
  void import('@eregion/overlay').then(async ({ mount, registerAdapter }) => {
    registerAdapter((await import('@eregion/adapter-react')).reactAdapter);
    const overlay = mount();
    if (overlay) (await import('@eregion/chat-ui')).mountChat(overlay);
  });
}
