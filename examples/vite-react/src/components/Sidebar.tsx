import { useState } from 'react';

const items = [
  { label: 'Inventory', active: true },
  { label: 'New' },
  { label: 'Pre-owned' },
  { label: 'Financing' },
  { label: 'Test drive' },
  { label: 'Contact' },
];

const ads = [
  {
    title: 'Financing at 0.99% a month',
    domain: 'autoelite.com/financing',
    text: 'Drive home today. Approval in 5 minutes, no down payment.',
    color: '#1877f2',
  },
  {
    title: 'Full detailing — 30% off',
    domain: 'shineup.com.br',
    text: 'Ceramic coating and interior detailing for your car.',
    color: '#42b72a',
  },
  {
    title: 'Sell your car in 24h',
    domain: 'quicksale.com',
    text: 'We appraise and pay on the spot. Free inspection.',
    color: '#f7b928',
  },
  {
    title: 'Auto insurance from $39/mo',
    domain: 'secureauto.com',
    text: 'Full coverage, 24h roadside assistance. Get a quote now.',
    color: '#e4405f',
  },
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

function AdCard({ ad }: { ad: (typeof ads)[number] }) {
  const [hover, setHover] = useState(false);
  return (
    <a
      href="#"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        gap: 10,
        padding: 8,
        borderRadius: 8,
        textDecoration: 'none',
        background: hover ? '#f2f2f2' : 'transparent',
        transition: 'background 0.15s ease',
      }}
    >
      {/* Ad thumbnail */}
      <div
        style={{
          width: 64,
          height: 64,
          flexShrink: 0,
          borderRadius: 8,
          background: ad.color,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontSize: 24,
          fontWeight: 700,
        }}
      >
        {ad.title.charAt(0)}
      </div>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: '#050505',
            lineHeight: 1.25,
            marginBottom: 2,
          }}
        >
          {ad.title}
        </div>
        <div
          style={{
            fontSize: 11,
            color: '#65676b',
            textTransform: 'uppercase',
            letterSpacing: 0.3,
          }}
        >
          {ad.domain}
        </div>
        <div style={{ fontSize: 12, color: '#65676b', lineHeight: 1.3, marginTop: 2 }}>
          {ad.text}
        </div>
      </div>
    </a>
  );
}

export function Sidebar() {
  return (
    <nav
      style={{
        width: 300,
        flexShrink: 0,
        fontFamily: '"Segoe UI", Helvetica, Arial, system-ui, sans-serif',
        display: 'grid',
        gap: 16,
      }}
    >
      {/* Menu */}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 2 }}>
        {items.map((item) => (
          <SidebarItem key={item.label} label={item.label} active={item.active} />
        ))}
      </ul>

      {/* Sponsored ads */}
      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 4,
            padding: '0 8px',
          }}
        >
          <span style={{ fontSize: 15, fontWeight: 600, color: '#65676b' }}>Sponsored</span>
          <a href="#" style={{ fontSize: 13, color: '#65676b', textDecoration: 'none' }}>
            ⋯
          </a>
        </div>
        <div style={{ display: 'grid', gap: 2 }}>
          {ads.map((ad) => (
            <AdCard key={ad.title} ad={ad} />
          ))}
        </div>
      </div>
    </nav>
  );
}
