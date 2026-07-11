interface Carro {
  id: string;
  modelo: string;
  preco: string;
}

export function CarCard({ carro }: { carro: Carro }) {
  return (
    <article
      style={{
        background: '#fff',
        border: '1px solid #b3b3b3',
        borderRadius: 3,
        fontFamily: '"lucida grande", tahoma, verdana, arial, sans-serif',
        fontSize: 11,
        color: '#333',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          background: '#3b5998',
          color: '#fff',
          padding: '4px 8px',
          fontSize: 11,
          fontWeight: 'bold',
        }}
      >
        {carro.modelo}
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          background: '#f7f7f7',
          padding: '8px',
        }}
      >
        <span style={{ color: '#3b5998', fontWeight: 'bold', fontSize: 11 }}>{carro.id}</span>
        <span
          style={{
            border: '1px solid #b3b3b3',
            background: '#edeff4',
            color: '#333',
            padding: '2px 6px',
            fontWeight: 'bold',
            fontSize: 11,
          }}
        >
          {carro.preco}
        </span>
      </div>
    </article>
  );
}
