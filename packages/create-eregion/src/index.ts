#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

type Framework = 'next' | 'vite-react' | 'react' | 'angular';
type PkgManager = 'pnpm' | 'yarn' | 'bun' | 'npm';

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  accent: '\x1b[38;5;173m',
  green: '\x1b[32m',
  red: '\x1b[31m',
};
const paint = (s: string, code: string) => (process.stdout.isTTY ? `${code}${s}${c.reset}` : s);

const FRAMEWORK_PACKAGES: Record<Framework, string[]> = {
  next: ['@eregion/next', '@eregion/daemon'],
  'vite-react': ['@eregion/build', '@eregion/overlay', '@eregion/adapter-react', '@eregion/chat-ui', '@eregion/daemon'],
  react: ['@eregion/build', '@eregion/overlay', '@eregion/adapter-react', '@eregion/chat-ui', '@eregion/daemon'],
  angular: ['@eregion/angular', '@eregion/daemon'],
};

const LABEL: Record<Framework, string> = {
  next: 'Next.js',
  'vite-react': 'Vite + React',
  react: 'React',
  angular: 'Angular',
};

interface Args {
  dir: string;
  framework?: Framework;
  pm?: PkgManager;
  skipInstall: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { dir: process.cwd(), skipInstall: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--skip-install') args.skipInstall = true;
    else if (a === '--framework') args.framework = argv[++i] as Framework;
    else if (a === '--pm') args.pm = argv[++i] as PkgManager;
    else if (a && !a.startsWith('-')) args.dir = resolve(a);
  }
  return args;
}

function readPkg(dir: string): Record<string, any> | null {
  const p = join(dir, 'package.json');
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function detectFramework(dir: string, pkg: Record<string, any>): Framework | null {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  if (deps.next) return 'next';
  if (deps['@angular/core']) return 'angular';
  if (deps.react) {
    const hasVite = Boolean(deps.vite) || ['ts', 'js', 'mjs'].some((e) => existsSync(join(dir, `vite.config.${e}`)));
    return hasVite ? 'vite-react' : 'react';
  }
  return null;
}

function detectPm(dir: string): PkgManager {
  if (existsSync(join(dir, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(dir, 'bun.lockb'))) return 'bun';
  if (existsSync(join(dir, 'yarn.lock'))) return 'yarn';
  if (existsSync(join(dir, 'package-lock.json'))) return 'npm';
  return 'npm';
}

function installArgs(pm: PkgManager, packages: string[]): string[] {
  const specs = packages.map((p) => `${p}@latest`);
  if (pm === 'npm') return ['install', '-D', ...specs];
  if (pm === 'bun') return ['add', '-d', ...specs];
  return ['add', '-D', ...specs]; // pnpm, yarn
}

function ensureGitignore(dir: string): boolean {
  const p = join(dir, '.gitignore');
  const entry = '.eregion/';
  const current = existsSync(p) ? readFileSync(p, 'utf8') : '';
  if (current.split(/\r?\n/).some((line) => line.trim() === entry || line.trim() === '.eregion')) return false;
  const next = current && !current.endsWith('\n') ? `${current}\n${entry}\n` : `${current}${entry}\n`;
  writeFileSync(p, next);
  return true;
}

const BOOTSTRAP = `if (import.meta.env.DEV) {
  void import('@eregion/overlay').then(async ({ mount, registerAdapter }) => {
    registerAdapter((await import('@eregion/adapter-react')).reactAdapter);
    const overlay = mount();
    if (overlay) (await import('@eregion/chat-ui')).mountChat(overlay);
  });
}
`;

function writeBootstrap(dir: string): string | null {
  const target = existsSync(join(dir, 'src')) ? join(dir, 'src', 'eregion.ts') : join(dir, 'eregion.ts');
  if (existsSync(target)) return null;
  writeFileSync(target, BOOTSTRAP);
  return target.replace(`${dir}/`, '');
}

function step(n: number, text: string): void {
  console.log(`  ${paint(`${n}.`, c.accent)} ${text}`);
}

function snippet(text: string): void {
  console.log(text.split('\n').map((l) => `     ${paint(l, c.dim)}`).join('\n'));
}

function printSetup(framework: Framework, dir: string): void {
  console.log(`\n${paint('Finish the setup:', c.bold)}\n`);

  if (framework === 'vite-react') {
    const boot = writeBootstrap(dir);
    if (boot) console.log(`  ${paint('✓', c.green)} created ${paint(boot, c.bold)} (dev-only overlay bootstrap)\n`);
    step(1, 'Add the tagging plugin to your Vite config:');
    snippet("import { viteEregion } from '@eregion/build';\n// plugins: [viteEregion({ appName: 'my-app' }), react()]");
    step(2, `Import the bootstrap once, at the top of your app entry (e.g. main.tsx):`);
    snippet("import './eregion';");
  } else if (framework === 'react') {
    step(1, 'Add the tagging plugin to your bundler (see the docs for your setup).');
    step(2, 'Mount the overlay behind your dev-only guard, in your app entry:');
    snippet(BOOTSTRAP.replace('import.meta.env.DEV', "process.env.NODE_ENV !== 'production'").trimEnd());
  } else if (framework === 'next') {
    step(1, 'Wrap your Next config:');
    snippet("import { withEregion } from '@eregion/next';\nexport default withEregion(nextConfig);");
    step(2, 'Render the devtools inside <body> in app/layout.tsx:');
    snippet("import { EregionDevtools } from '@eregion/next/devtools';\n// … <EregionDevtools /> …");
    step(3, 'Optional — enable backend traces in instrumentation.ts:');
    snippet("import { registerEregionInstrumentation } from '@eregion/next/instrumentation';\nexport function register() { return registerEregionInstrumentation(); }");
  } else if (framework === 'angular') {
    step(1, 'Initialize Eregion in main.ts (dev-only):');
    snippet("import { initEregion } from '@eregion/angular';\nif (typeof ngDevMode !== 'undefined' && ngDevMode) void initEregion();");
  }

  const autoDaemon = framework === 'vite-react' || framework === 'next';
  console.log(`\n${paint('Then, to start editing:', c.bold)}\n`);
  if (autoDaemon) {
    step(1, `Start your dev server as usual — the daemon boots with it, no separate command.`);
    step(2, `In the app, press ${paint('Alt+S', c.bold)}, click a component, and describe the change.`);
  } else {
    step(1, `Run the daemon at your repo root: ${paint('npx eregion-dev', c.bold)}`);
    step(2, 'Start your dev server as usual.');
    step(3, `In the app, press ${paint('Alt+S', c.bold)}, click a component, and describe the change.`);
  }
  console.log('');
}

function help(): void {
  console.log(`
${paint('create-eregion', c.bold)} — add Eregion to your app

  ${paint('npm create eregion@latest', c.accent)}          set up in the current project
  ${paint('npm create eregion@latest ./my-app', c.accent)} set up in another directory

Options:
  --framework <next|vite-react|react|angular>   skip framework detection
  --pm <pnpm|yarn|bun|npm>                       force a package manager
  --skip-install                                do not install packages
  -h, --help                                    show this help
`);
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return help();

  console.log(`\n${paint('⟡ eregion', c.accent)} ${paint('— visual AI editing for your components', c.dim)}\n`);

  const pkg = readPkg(args.dir);
  if (!pkg) {
    console.error(paint(`No package.json found in ${args.dir}.`, c.red));
    console.error('Run this inside your app, or pass the path: npm create eregion@latest ./my-app');
    process.exit(1);
  }

  const framework = args.framework ?? detectFramework(args.dir, pkg);
  if (!framework) {
    console.error(paint('Could not detect a supported framework (React, Next.js, or Angular).', c.red));
    console.error('Force one with --framework, e.g. --framework vite-react');
    process.exit(1);
  }

  const pm = args.pm ?? detectPm(args.dir);
  const packages = FRAMEWORK_PACKAGES[framework];

  console.log(`  ${paint('detected', c.dim)}  ${paint(LABEL[framework], c.bold)}  ${paint(`· ${pm}`, c.dim)}`);
  console.log(`  ${paint('installing', c.dim)}  ${packages.join(', ')}\n`);

  if (!args.skipInstall) {
    const run = spawnSync(pm, installArgs(pm, packages), {
      cwd: args.dir,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    if (run.status !== 0) {
      console.error(paint('\nInstall failed. Fix the error above and re-run, or use --skip-install.', c.red));
      process.exit(run.status ?? 1);
    }
  } else {
    console.log(paint('  skipped install (--skip-install)', c.dim));
  }

  if (ensureGitignore(args.dir)) console.log(`\n  ${paint('✓', c.green)} added .eregion/ to .gitignore`);

  printSetup(framework, args.dir);
}

main();
