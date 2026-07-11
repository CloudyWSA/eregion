interface Car {
  id: string;
  model: string;
  price: string;
  year: string;
  km: string;
  transmission: string;
  fuel: string;
  color: string;
}

const labels: { field: keyof Car; label: string }[] = [
  { field: 'year', label: 'Year' },
  { field: 'km', label: 'KM' },
  { field: 'transmission', label: 'Transmission' },
  { field: 'fuel', label: 'Fuel' },
  { field: 'color', label: 'Color' },
  { field: 'id', label: 'Plate' },
];

export function CarCard({ car }: { car: Car }) {
  return (
    <article
      style={{
        background: '#fff',
        border: '1px solid #dddfe2',
        borderRadius: 8,
        boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
        fontFamily:
          'system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif',
        color: '#050505',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '12px 16px',
        }}
      >
        <span style={{ fontSize: 17, fontWeight: 600, letterSpacing: -0.2 }}>
          {car.model}
        </span>
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: '#1877f2',
            background: '#e7f3ff',
            padding: '4px 12px',
            borderRadius: 999,
            whiteSpace: 'nowrap',
          }}
        >
          {car.price}
        </span>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 1,
          background: '#f0f2f5',
          borderTop: '1px solid #f0f2f5',
        }}
      >
        {labels.map(({ field, label }) => (
          <div key={field} style={{ background: '#fff', padding: '10px 16px' }}>
            <div style={{ fontSize: 12, color: '#65676b', marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: '#050505' }}>
              {car[field]}
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}
