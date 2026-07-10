// e2e multi-select: 3 cards selecionados + pedido de padronização.
import { readFileSync } from 'node:fs';

const info = JSON.parse(readFileSync(new URL('../../.eregion/daemon.json', import.meta.url)));
const ws = new WebSocket(`ws://127.0.0.1:${info.port}/ws`);
let id = 0;
const send = (type, payload) => ws.send(JSON.stringify({ v: 1, id: `m${++id}`, type, payload }));

const card = (n, top) => ({
  id: `s${n}`,
  name: 'OrderCard',
  framework: 'react',
  src: { file: 'examples/vite-react/src/components/OrderCard.tsx', line: 7 },
  tpl: { file: 'examples/vite-react/src/components/OrderCard.tsx', line: 9, column: 5 },
  dom: { tag: 'article', rect: [24, top, 672, 80], text: `P-10${n}` },
});

ws.addEventListener('open', () => {
  send('hello', { token: info.token });
  send('selection.update', {
    payload: {
      v: 1,
      app: { framework: 'react', name: 'example-vite-react', route: '/' },
      selection: [card(1, 100), card(2, 200), card(3, 300)],
    },
  });
  send('chat.send', {
    text: 'Padronize esses 3 cards: borderRadius 12, sombra sutil (boxShadow) e o total em negrito. É o mesmo componente OrderCard.',
    attachSelection: true,
  });
  console.log('[e2e-multi] enviado…');
});

ws.addEventListener('message', (event) => {
  const msg = JSON.parse(String(event.data));
  if (msg.type === 'chat.delta') process.stdout.write(msg.payload.text);
  else if (msg.type === 'chat.tool') console.log(`\n[tool ${msg.payload.status}] ${msg.payload.name}`);
  else if (msg.type === 'edit.applied') console.log(`\n[edit] ${msg.payload.file}`);
  else if (msg.type === 'error') console.log(`\n[erro] ${msg.payload.code}: ${msg.payload.message}`);
  else if (msg.type === 'chat.result') {
    const u = msg.payload.usage;
    console.log(`\n[result] out=${u.outputTokens} cacheRead=${u.cacheReadTokens} custo=$${(u.costUsd ?? 0).toFixed(4)} em ${(msg.payload.durationMs / 1000).toFixed(1)}s`);
    process.exit(0);
  }
});

setTimeout(() => { console.log('\n[e2e-multi] timeout'); process.exit(1); }, 240_000);
