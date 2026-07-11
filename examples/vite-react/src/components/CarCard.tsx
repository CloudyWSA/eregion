interface Carro {
  id: string;
  modelo: string;
  preco: string;
}

export function CarCard({ carro }: { carro: Carro }) {
  return (
    <article
      style={{
        background: '#ffe600',
        border: '3px solid #000',
        borderRadius: 0,
        padding: 16,
        boxShadow: '6px 6px 0 #000',
        fontFamily: 'monospace',
      }}
    >
      <strong style={{ fontSize: 18, textTransform: 'uppercase', letterSpacing: 1 }}>
        {carro.modelo}
      </strong>{' '}
      — {carro.id}
      <div
        style={{
          marginTop: 8,
          background: '#000',
          color: '#ffe600',
          display: 'inline-block',
          padding: '2px 8px',
          fontWeight: 700,
        }}
      >
        {carro.preco}
      </div>
    </article>
  );
}
