const tabs = ['Home', 'Inventory', 'Favorites', 'Messages'];
const accountLinks = ['Account', 'Settings', 'Log out'];

export function Header({ title }: { title: string }) {
  return (
    <header
      style={{
        marginBottom: 24,
        fontFamily: '"lucida grande", tahoma, verdana, arial, sans-serif',
      }}
    >
      {/* Main blue bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          background: '#3b5998',
          borderTop: '1px solid #6d84b4',
          padding: '0 10px',
          height: 42,
        }}
      >
        {/* Old-facebook-style logo */}
        <span
          style={{
            fontSize: 22,
            fontWeight: 'bold',
            letterSpacing: -1,
            color: '#fff',
            fontFamily: '"Klavika", "lucida grande", tahoma, verdana, arial, sans-serif',
            textTransform: 'lowercase',
            whiteSpace: 'nowrap',
          }}
        >
          {title}
        </span>

        {/* Search field */}
        <input
          type="text"
          placeholder="Search vehicles"
          style={{
            border: '1px solid #1d2a54',
            padding: '2px 6px',
            fontSize: 11,
            width: 160,
            fontFamily: 'inherit',
          }}
        />

        <div style={{ flex: 1 }} />

        {/* Account links on the right */}
        <div style={{ display: 'flex', gap: 8, fontSize: 11 }}>
          {accountLinks.map((link) => (
            <a
              key={link}
              href="#"
              style={{ color: '#fff', textDecoration: 'none', fontWeight: 'bold' }}
            >
              {link}
            </a>
          ))}
        </div>
      </div>

      {/* Navigation tabs */}
      <div
        style={{
          display: 'flex',
          background: '#3b5998',
          borderTop: '1px solid #29447e',
          paddingLeft: 6,
        }}
      >
        {tabs.map((tab, i) => (
          <a
            key={tab}
            href="#"
            style={{
              padding: '5px 14px',
              fontSize: 11,
              fontWeight: 'bold',
              color: i === 0 ? '#3b5998' : '#fff',
              background: i === 0 ? '#fff' : 'transparent',
              textDecoration: 'none',
            }}
          >
            {tab}
          </a>
        ))}
      </div>
    </header>
  );
}
