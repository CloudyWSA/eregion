import { useState } from 'react';

export function Card({ title }: { title: string }) {
  const [n, setN] = useState(0);
  return (
    <div className="card">
      <p>{title}</p>
      <button onClick={() => setN((v) => v + 1)}>cliques: {n}</button>
    </div>
  );
}
