interface Carro {
  id: string;
  modelo: string;
  preco: string;
}

export function CarCard({ carro }: { carro: Carro }) {
  return (
    <article
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        background: '#fff',
        border: '1px solid #ececec',
        borderRadius: 24,
        padding: '18px 20px',
        boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.06)',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        <span style={{ fontSize: 16, fontWeight: 600, color: '#18181b', lineHeight: 1.2 }}>
          {carro.modelo}
        </span>
        <span
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: '#71717a',
            letterSpacing: 0.4,
            fontFamily: 'ui-monospace, monospace',
          }}
        >
          {carro.id}
        </span>
      </div>
      <div
        style={{
          flexShrink: 0,
          fontSize: 15,
          fontWeight: 600,
          color: '#047857',
          background: '#ecfdf5',
          padding: '6px 12px',
          borderRadius: 999,
        }}
      >
        {carro.preco}
      </div>
    </article>
  );
}
