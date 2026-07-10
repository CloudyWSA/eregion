import { Header } from './components/Header';
import { OrderCard } from './components/OrderCard';

const pedidos = [
  { id: 'P-101', cliente: 'ACME Ltda', total: 'R$ 1.250,00' },
  { id: 'P-102', cliente: 'Wayne S.A.', total: 'R$ 380,00' },
  { id: 'P-103', cliente: 'Stark Corp', total: 'R$ 9.999,00' },
];

export function App() {
  return (
    <main style={{ fontFamily: 'system-ui', maxWidth: 720, margin: '0 auto', padding: 24 }}>
      <Header titulo="Pedidos" />
      <section style={{ display: 'grid', gap: 12 }}>
        {pedidos.map((p) => (
          <OrderCard key={p.id} pedido={p} />
        ))}
      </section>
    </main>
  );
}
