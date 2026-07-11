#!/usr/bin/env node
// Daemon CLI: `npx eregion-dev` at the root (or a subfolder) of the app repo.
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
  console.log(`▸ ws:   ws://127.0.0.1:${daemon.port}/ws (token in .eregion/daemon.json)`);
  console.log('▸ waiting for the overlay to connect… (Ctrl+C to exit)');

  const shutdown = async () => {
    console.log('\nshutting down…');
    await daemon.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('failed to start the daemon:', err instanceof Error ? err.message : err);
  process.exit(1);
});
