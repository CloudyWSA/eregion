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
      <h1
        style={{
          fontSize: 34,
          fontWeight: 'bold',
          letterSpacing: -1.5,
          margin: 0,
          color: '#3b5998',
          fontFamily: '"Klavika", "lucida grande", tahoma, verdana, arial, sans-serif',
          textTransform: 'lowercase',
        }}
      >
        {titulo}
      </h1>
    </header>
  );
}
