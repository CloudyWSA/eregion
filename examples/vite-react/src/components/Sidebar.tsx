import { useState } from 'react';

const items = [
  { label: 'Inventory', active: true },
  { label: 'New' },
  { label: 'Pre-owned' },
  { label: 'Financing' },
  { label: 'Test drive' },
  { label: 'Contact' },
];

function SidebarItem({ label, active }: { label: string; active?: boolean }) {
  const [hover, setHover] = useState(false);
  const background = active ? '#e7f3ff' : hover ? '#f2f2f2' : 'transparent';
  return (
    <li>
      <a
        href="#"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          display: 'block',
          padding: '8px 12px',
          borderRadius: 8,
          color: active ? '#1877f2' : '#050505',
          fontSize: 15,
          fontWeight: active ? 600 : 500,
          textDecoration: 'none',
          background,
          transition: 'background 0.15s ease',
        }}
      >
        {label}
      </a>
    </li>
  );
}

export function Sidebar() {
  return (
    <nav
      style={{
        width: 180,
        flexShrink: 0,
        background: '#fff',
        border: '1px solid #b3b3b3',
        borderRadius: 3,
        fontFamily:
          '"Segoe UI", Helvetica, Arial, system-ui, sans-serif',
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
      <ul style={{ listStyle: 'none', margin: 0, padding: 8, display: 'grid', gap: 2 }}>
        {items.map((item) => (
          <SidebarItem key={item.label} label={item.label} active={item.active} />
        ))}
      </ul>
    </nav>
  );
}
