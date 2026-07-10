// Verificação ponta a ponta do daemon sem browser: simula o que o overlay
// faz (hello → selection.update → chat.send) e espera a IA editar o arquivo.
// Usa o WebSocket nativo do Node 22+.
import { readFileSync } from 'node:fs';

const info = JSON.parse(readFileSync(new URL('../../.eregion/daemon.json', import.meta.url)));
const ws = new WebSocket(`ws://127.0.0.1:${info.port}/ws`);
let id = 0;
const send = (type, payload) => ws.send(JSON.stringify({ v: 1, id: `e${++id}`, type, payload }));

const selecao = {
  v: 1,
  app: { framework: 'react', name: 'example-vite-react', route: '/' },
  selection: [
    {
      id: 's1',
      name: 'Header',
      framework: 'react',
      src: { file: 'examples/vite-react/src/components/Header.tsx', line: 1 },
      tpl: { file: 'examples/vite-react/src/components/Header.tsx', line: 5, column: 7 },
      dom: { tag: 'button', rect: [600, 24, 120, 32], text: 'Novo pedido' },
    },
  ],
};

ws.addEventListener('open', () => {
  send('hello', { token: info.token });
  send('selection.update', { payload: selecao });
  send('chat.send', {
    text: 'Mude o texto do botão selecionado de "Novo pedido" para "Criar pedido". Só isso.',
    attachSelection: true,
  });
  console.log('[e2e] mensagem enviada, aguardando a IA…');
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
    ws.close();
    process.exit(0);
  }
});

setTimeout(() => { console.log('\n[e2e] timeout de 240s'); process.exit(1); }, 240_000);
