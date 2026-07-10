'use client';

import { useState } from 'react';

// Client Component.
export function ClientButton() {
  const [n, setN] = useState(0);
  return (
    <button id="client-btn" onClick={() => setN((v) => v + 1)}>
      cliques: {n}
    </button>
  );
}
