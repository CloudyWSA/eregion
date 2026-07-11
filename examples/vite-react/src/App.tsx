import { Header } from './components/Header';
import { CarCard } from './components/CarCard';

const carros = [
  { id: 'ABC-1234', modelo: 'Fiat Uno', preco: 'R$ 32.500,00' },
  { id: 'XYZ-5678', modelo: 'VW Gol', preco: 'R$ 45.900,00' },
  { id: 'JKL-9012', modelo: 'Chevrolet Onix', preco: 'R$ 78.000,00' },
];

export function App() {
  return (
    <main style={{ fontFamily: 'system-ui', maxWidth: 720, margin: '0 auto', padding: 24 }}>
      <Header titulo="AutoElite Veículos" />
      <section style={{ display: 'grid', gap: 12 }}>
        {carros.map((c) => (
          <CarCard key={c.id} carro={c} />
        ))}
      </section>
    </main>
  );
}
