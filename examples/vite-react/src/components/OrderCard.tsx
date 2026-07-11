interface Order {
  id: string;
  customer: string;
  total: number;
}

export function OrderCard({ order }: { order: Order }) {
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
          {order.customer}
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
          {order.total.toLocaleString('en-US', {
            style: 'currency',
            currency: 'USD',
          })}
        </span>
      </div>
      <div
        style={{
          padding: '10px 16px',
          background: '#fff',
          borderTop: '1px solid #f0f2f5',
        }}
      >
        <div style={{ fontSize: 12, color: '#65676b', marginBottom: 2 }}>Order</div>
        <div style={{ fontSize: 14, fontWeight: 500, color: '#050505' }}>
          {order.id}
        </div>
      </div>
    </article>
  );
}
