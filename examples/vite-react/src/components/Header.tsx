export function Header({ titulo }: { titulo: string }) {
  return (
    <header
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 32,
        paddingBottom: 12,
        borderBottom: '1px solid #eaeaea',
      }}
    >
      <h1 style={{ fontSize: 18, fontWeight: 500, letterSpacing: -0.2, margin: 0, color: '#111' }}>
        {titulo}
      </h1>
      <button
        style={{
          padding: '6px 14px',
          fontSize: 14,
          color: '#111',
          background: 'transparent',
          border: '1px solid #ddd',
          borderRadius: 6,
          cursor: 'pointer',
        }}
      >
        Novo pedido
      </button>
    </header>
  );
}
