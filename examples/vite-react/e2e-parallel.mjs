// e2e do paralelismo: dois jobs disparados em sequência imediata devem rodar
// em sessões distintas do pool e terminar com eventos carimbados por jobId.
import { readFileSync } from 'node:fs';

const info = JSON.parse(readFileSync(new URL('../../.eregion/daemon.json', import.meta.url)));
const ws = new WebSocket(`ws://127.0.0.1:${info.port}/ws`);
let id = 0;
const send = (type, payload) => ws.send(JSON.stringify({ v: 1, id: `p${++id}`, type, payload }));

const t0 = Date.now();
const done = new Set();
const firstDelta = {};

ws.addEventListener('open', () => {
  send('hello', { token: info.token });
  send('chat.send', { text: 'Mude o texto do botão em examples/vite-react/src/components/Header.tsx de "Novo pedido" para "Criar pedido". Só isso, direto.', attachSelection: false, jobId: 'job-header' });
  send('chat.send', { text: 'Em examples/vite-react/src/components/OrderCard.tsx, mude borderRadius de 8 para 10. Só isso, direto.', attachSelection: false, jobId: 'job-card' });
  console.log('[e2e] 2 jobs disparados juntos');
});

ws.addEventListener('message', (event) => {
  const msg = JSON.parse(String(event.data));
  const j = msg.payload?.jobId ?? '?';
  const t = ((Date.now() - t0) / 1000).toFixed(1);
  if (msg.type === 'chat.delta') {
    if (!firstDelta[j]) { firstDelta[j] = t; console.log(`[${t}s] primeiro delta de ${j}`); }
  } else if (msg.type === 'edit.applied') console.log(`[${t}s] edit (${j}): ${msg.payload.file.split('/').pop()}`);
  else if (msg.type === 'error') console.log(`[${t}s] erro (${j}): ${msg.payload.code} ${msg.payload.message}`);
  else if (msg.type === 'chat.result') {
    console.log(`[${t}s] result (${j}): $${(msg.payload.usage.costUsd ?? 0).toFixed(3)}`);
    done.add(j);
    if (done.size === 2) {
      console.log(`[e2e] PARALELO=${firstDelta['job-header'] && firstDelta['job-card'] && Math.abs(firstDelta['job-header'] - firstDelta['job-card']) < 8 ? 'sim' : 'ver tempos'}`);
      process.exit(0);
    }
  }
});

setTimeout(() => { console.log('[e2e] timeout'); process.exit(1); }, 300_000);
