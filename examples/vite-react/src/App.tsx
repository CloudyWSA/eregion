import { Fragment, useEffect, useState } from 'react';
import { Header } from './components/Header';
import { OrderCard } from './components/OrderCard';
import { Sidebar } from './components/Sidebar';
import { FacebookAd } from './components/FacebookAd';

interface Order {
  id: string;
  customer: string;
  total: number;
}

export function App() {
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    fetch('http://localhost:3199/api/orders')
      .then((r) => r.json())
      .then((data: Order[]) => setOrders(data))
      .catch(() => setOrders([]));
  }, []);

  return (
    <main
      style={{
        fontFamily: 'system-ui',
        width: '100%',
        minHeight: '100vh',
        margin: 0,
        padding: 24,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Header title="AutoElite Motors" />
      <div style={{ display: 'flex', gap: 16, alignItems: 'stretch', flex: 1 }}>
        <Sidebar />
        <section style={{ display: 'grid', gap: 12, flex: 1, alignContent: 'start' }}>
          {orders.map((o, i) => (
            <Fragment key={o.id}>
              {i === Math.floor(orders.length / 2) && <FacebookAd />}
              <OrderCard order={o} />
            </Fragment>
          ))}
        </section>
      </div>
    </main>
  );
}
