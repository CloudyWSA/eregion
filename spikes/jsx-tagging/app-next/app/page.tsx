import { ClientButton } from './ClientButton';

// Server Component (sem 'use client'): renderiza no servidor.
export default function Page() {
  return (
    <main id="server-root">
      <h1>Spike Next fc-src</h1>
      <p>renderizado por Server Component</p>
      <ClientButton />
    </main>
  );
}
