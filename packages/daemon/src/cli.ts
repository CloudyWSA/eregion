#!/usr/bin/env node
// CLI do daemon: `npx eregion-dev` na raiz (ou subpasta) do repo do app.
import { startDaemon, VERSION } from './daemon.js';

function parallelFromArgs(argv: string[]): number | undefined {
  const flag = argv.indexOf('--parallel');
  if (flag >= 0 && argv[flag + 1]) return Number(argv[flag + 1]);
  return undefined;
}

async function main(): Promise<void> {
  console.log(`eregion-dev v${VERSION}`);
  const daemon = await startDaemon({ parallel: parallelFromArgs(process.argv) });
  console.log(`▸ repo: ${daemon.repoRoot}`);
  console.log(`▸ ws:   ws://127.0.0.1:${daemon.port}/ws (token em .eregion/daemon.json)`);
  console.log('▸ aguardando o overlay conectar… (Ctrl+C para sair)');

  const shutdown = async () => {
    console.log('\nencerrando…');
    await daemon.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('falha ao iniciar o daemon:', err instanceof Error ? err.message : err);
  process.exit(1);
});
