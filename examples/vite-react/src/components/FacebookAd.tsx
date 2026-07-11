const font =
  'system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif';

export function FacebookAd() {
  return (
    <article
      style={{
        gridColumn: '1 / -1',
        background: '#fff',
        border: '1px solid #dddfe2',
        borderRadius: 8,
        boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
        fontFamily: font,
        color: '#050505',
        overflow: 'hidden',
      }}
    >
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px' }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #1877f2, #0a52c7)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: 18,
            flexShrink: 0,
          }}
        >
          A
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>AutoElite Motors</div>
          <div style={{ fontSize: 12, color: '#65676b', display: 'flex', alignItems: 'center', gap: 4 }}>
            Sponsored · <span aria-hidden>🌐</span>
          </div>
        </div>
        <div style={{ color: '#65676b', fontSize: 20, fontWeight: 700, cursor: 'pointer' }}>⋯</div>
      </div>

      {/* copy */}
      <div style={{ padding: '0 16px 12px', fontSize: 15, lineHeight: 1.4 }}>
        🚗 <strong>Mid-year clearance is on!</strong> Certified pre-owned cars starting at{' '}
        <strong>$6,500</strong> with 0% APR financing for 48 months. Trade in your old car today
        and drive home a new one this weekend. 👇
      </div>

      {/* creative / image */}
      <div
        style={{
          position: 'relative',
          aspectRatio: '1.91 / 1',
          background: 'linear-gradient(120deg, #1877f2 0%, #0a52c7 55%, #062b6b 100%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          textAlign: 'center',
          padding: 24,
        }}
      >
        <div style={{ fontSize: 13, letterSpacing: 3, opacity: 0.85, marginBottom: 8 }}>
          AUTOELITE MOTORS
        </div>
        <div style={{ fontSize: 44, fontWeight: 800, lineHeight: 1, letterSpacing: -1 }}>
          UP TO 40% OFF
        </div>
        <div style={{ fontSize: 18, fontWeight: 600, marginTop: 8, opacity: 0.95 }}>
          Summer Clearance Event
        </div>
      </div>

      {/* link card footer */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          background: '#f0f2f5',
          padding: '12px 16px',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, color: '#65676b', textTransform: 'uppercase' }}>
            autoelite.com
          </div>
          <div style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.2 }}>
            Find your next car for less
          </div>
          <div style={{ fontSize: 13, color: '#65676b' }}>
            Browse 200+ inspected vehicles with warranty.
          </div>
        </div>
        <button
          style={{
            flexShrink: 0,
            background: '#e4e6eb',
            color: '#050505',
            border: 'none',
            borderRadius: 6,
            padding: '8px 14px',
            fontSize: 15,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: font,
          }}
        >
          Learn more
        </button>
      </div>

      {/* action bar */}
      <div
        style={{
          display: 'flex',
          borderTop: '1px solid #ced0d4',
          color: '#65676b',
          fontSize: 15,
          fontWeight: 600,
        }}
      >
        {['👍 Like', '💬 Comment', '↪ Share'].map((action) => (
          <button
            key={action}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              padding: '8px 0',
              color: '#65676b',
              fontSize: 15,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: font,
            }}
          >
            {action}
          </button>
        ))}
      </div>
    </article>
  );
}
