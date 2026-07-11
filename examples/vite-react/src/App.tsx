import { Fragment, useEffect, useState } from 'react';
import { Header } from './components/Header';
import { CarCard } from './components/CarCard';
import { Sidebar } from './components/Sidebar';
import { FacebookAd } from './components/FacebookAd';

interface Order {
  id: string;
  customer: string;
  total: number;
}

function orderToCar(o: Order) {
  return {
    id: o.id,
    model: o.customer,
    price: o.total.toLocaleString('en-US', { style: 'currency', currency: 'USD' }),
    year: '—',
    km: '—',
    transmission: '—',
    fuel: '—',
    color: '—',
  };
}

export function App() {
  const [cars, setCars] = useState<ReturnType<typeof orderToCar>[]>([]);

  useEffect(() => {
    fetch('http://localhost:3199/api/orders')
      .then((r) => r.json())
      .then((orders: Order[]) => setCars(orders.map(orderToCar)))
      .catch(() => setCars([]));
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
          {cars.map((c, i) => (
            <Fragment key={c.id}>
              {i === Math.floor(cars.length / 2) && <FacebookAd />}
              <CarCard car={c} />
            </Fragment>
          ))}
        </section>
      </div>
    </main>
  );
}
