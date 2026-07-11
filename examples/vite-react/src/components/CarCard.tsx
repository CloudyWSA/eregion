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
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          background: '#3b5998',
          color: '#fff',
          padding: '4px 8px',
          fontSize: 11,
          fontWeight: 'bold',
        }}
      >
        <span>{car.model}</span>
        <span>{car.price}</span>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', background: '#f7f7f7' }}>
        <tbody>
          {labels.map(({ field, label }) => (
            <tr key={field} style={{ borderTop: '1px solid #eee' }}>
              <td
                style={{
                  padding: '4px 8px',
                  color: '#666',
                  fontWeight: 'bold',
                  width: 90,
                  verticalAlign: 'top',
                  whiteSpace: 'nowrap',
                }}
              >
                {label}
              </td>
              <td style={{ padding: '4px 8px', color: '#333' }}>{car[field]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  );
}
