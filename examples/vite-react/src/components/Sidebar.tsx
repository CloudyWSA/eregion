const items = [
  { label: 'Inventory', active: true },
  { label: 'New' },
  { label: 'Pre-owned' },
  { label: 'Financing' },
  { label: 'Test drive' },
  { label: 'Contact' },
];

export function Sidebar() {
  return (
    <nav
      style={{
        width: 180,
        flexShrink: 0,
        background: '#fff',
        border: '1px solid #b3b3b3',
        borderRadius: 3,
        fontFamily: '"lucida grande", tahoma, verdana, arial, sans-serif',
        fontSize: 11,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          background: '#3b5998',
          color: '#fff',
          padding: '4px 8px',
          fontWeight: 'bold',
          fontSize: 11,
        }}
      >
        Menu
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {items.map((item, i) => (
          <li
            key={item.label}
            style={{
              borderTop: i === 0 ? 'none' : '1px solid #eee',
              background: item.active ? '#edeff4' : '#fff',
            }}
          >
            <a
              href="#"
              style={{
                display: 'block',
                padding: '5px 8px',
                color: '#3b5998',
                textDecoration: 'none',
                fontWeight: item.active ? 'bold' : 'normal',
              }}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
