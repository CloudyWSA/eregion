import { Fragment } from 'react';
import { Header } from './components/Header';
import { CarCard } from './components/CarCard';
import { Sidebar } from './components/Sidebar';
import { FacebookAd } from './components/FacebookAd';

const cars = [
  {
    id: 'ABC-1234',
    model: 'Fiat Uno',
    price: '$6,500.00',
    year: '2015/2016',
    km: '78,400 km',
    transmission: 'Manual',
    fuel: 'Flex',
    color: 'Silver',
  },
  {
    id: 'XYZ-5678',
    model: 'VW Gol',
    price: '$9,200.00',
    year: '2018/2019',
    km: '52,100 km',
    transmission: 'Manual',
    fuel: 'Flex',
    color: 'White',
  },
  {
    id: 'JKL-9012',
    model: 'Chevrolet Onix',
    price: '$15,600.00',
    year: '2022/2023',
    km: '18,900 km',
    transmission: 'Automatic',
    fuel: 'Flex',
    color: 'Black',
  },
];

export function App() {
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
