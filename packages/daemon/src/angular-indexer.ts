import { readdirSync, readFileSync, statSync, watch as fsWatch, type Dirent, type FSWatcher } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { Node, Project, type Decorator } from 'ts-morph';
import type { AngularComponentEntry, AngularIndex } from '@eregion/protocol';

// Diretórios que nunca contêm fonte de app relevante — pular corta o custo do
// scan (o achado do spike: só ~889 de 2718 .ts do app real interessam).
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.turbo', 'coverage', '.angular', '.eregion']);
const STALE_CHECK_THROTTLE_MS = 1_000;

interface ProjectRoot {
  name: string;
  /** Path relativo ao repoRoot, em separador posix; '' = raiz do repo. */
  root: string;
}

/**
 * Índice estático de componentes/diretivas Angular (parse sintático com ts-morph
 * dos decorators @Component/@Directive — o build do app não é tocado). Portado
 * do spike `spikes/angular-indexer`, adaptado para varrer o repoRoot do daemon,
 * carimbar o projeto de origem (angular.json) e servir o índice em cache.
 */
export class AngularIndexer {
  private cache: AngularIndex | null = null;
  /** mtime dos arquivos indexados na última build (para invalidação barata). */
  private mtimes = new Map<string, number>();
  private lastCheckMs = 0;
  private watcher: FSWatcher | null = null;

  constructor(private readonly repoRoot: string) {}

  /** Força uma reconstrução completa e devolve o índice. */
  build(): AngularIndex {
    return this.rebuild();
  }

  /**
   * Índice em cache. Reconstrói na primeira chamada e quando um arquivo já
   * indexado mudou de mtime (checagem estrangulada a 1×/s). Arquivos novos são
   * capturados pelo `watch()` opcional, que invalida o cache.
   */
  getIndex(): AngularIndex {
    if (!this.cache) return this.rebuild();
    const now = Date.now();
    if (now - this.lastCheckMs >= STALE_CHECK_THROTTLE_MS) {
      this.lastCheckMs = now;
      if (this.isStale()) return this.rebuild();
    }
    return this.cache;
  }

  /**
   * Observa o repoRoot e invalida o cache quando .ts/.html/angular.json mudam.
   * fs.watch recursivo não existe em todo SO; em falha, degrada para no-op (a
   * checagem de mtime em getIndex ainda cobre edições de arquivos já indexados).
   */
  watch(): () => void {
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      this.watcher = fsWatch(this.repoRoot, { recursive: true }, (_event, filename) => {
        if (!filename) return;
        const name = String(filename);
        if (name.includes('node_modules')) return;
        if (!name.endsWith('.ts') && !name.endsWith('.html') && !name.endsWith('angular.json')) return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          this.cache = null;
        }, 300);
      });
    } catch {
      return () => {};
    }
    return () => {
      if (timer) clearTimeout(timer);
      this.watcher?.close();
      this.watcher = null;
    };
  }

  private rebuild(): AngularIndex {
    const files = this.collectCandidates();
    const projects = this.readProjects();
    // ts-morph sintático puro: sem tsconfig, sem type-checker; libera cada
    // SourceFile após extrair para não segurar 900 ASTs na memória.
    const project = new Project({
      skipAddingFilesFromTsConfig: true,
      skipFileDependencyResolution: true,
    });
    const entries: AngularComponentEntry[] = [];
    const mtimes = new Map<string, number>();

    for (const file of files) {
      mtimes.set(file, safeMtime(file));
      const sf = project.addSourceFileAtPath(file);
      const rel = toPosix(relative(this.repoRoot, file));
      const proj = projectOf(rel, projects);
      for (const cls of sf.getClasses()) {
        for (const dec of cls.getDecorators()) {
          const decName = dec.getName();
          if (decName !== 'Component' && decName !== 'Directive') continue;
          const meta = readDecorator(dec);
          // Linha da declaração da classe (não do decorator, que a antecede).
          const line = cls.getNameNode()?.getStartLineNumber() ?? cls.getStartLineNumber();
          const entry: AngularComponentEntry = {
            className: cls.getName() ?? '(anonymous)',
            src: { file: rel, line },
          };
          if (meta.selector) entry.selector = meta.selector;
          if (proj) entry.project = proj;
          if (meta.templateUrl) {
            const tplAbs = join(dirname(file), meta.templateUrl);
            entry.template = { file: toPosix(relative(this.repoRoot, tplAbs)), line: 1 };
          }
          entries.push(entry);
        }
      }
      project.removeSourceFile(sf);
    }

    this.mtimes = mtimes;
    this.lastCheckMs = Date.now();
    this.cache = { entries, builtAtMs: Date.now() };
    return this.cache;
  }

  /** Reconstrói só se um arquivo já indexado sumiu ou mudou de mtime. */
  private isStale(): boolean {
    for (const [file, prev] of this.mtimes) {
      if (safeMtime(file) !== prev) return true;
    }
    return false;
  }

  /**
   * Arquivos .ts (fora de SKIP_DIRS, .d.ts e .spec.ts) que mencionam os
   * decorators. Pré-filtro por substring evita entregar 2/3 dos arquivos ao
   * ts-morph — o gargalo real é o parse, não a leitura.
   */
  private collectCandidates(): string[] {
    const out: string[] = [];
    const walk = (dir: string): void => {
      let ents: Dirent[];
      try {
        ents = readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const ent of ents) {
        const full = join(dir, ent.name);
        if (ent.isDirectory()) {
          if (!SKIP_DIRS.has(ent.name)) walk(full);
        } else if (
          ent.isFile() &&
          ent.name.endsWith('.ts') &&
          !ent.name.endsWith('.d.ts') &&
          !ent.name.endsWith('.spec.ts')
        ) {
          let src: string;
          try {
            src = readFileSync(full, 'utf8');
          } catch {
            continue;
          }
          if (src.includes('@Component(') || src.includes('@Directive(')) out.push(full);
        }
      }
    };
    walk(this.repoRoot);
    return out;
  }

  /**
   * Projetos declarados no(s) angular.json do repo. Monorepos Angular têm mais
   * de um app `application` (monorepos Angular costumam ter apps quase-duplicados),
   * quase-duplicados — o projeto de origem é o que permite desambiguar depois.
   */
  private readProjects(): ProjectRoot[] {
    const result: ProjectRoot[] = [];
    for (const aj of this.findAngularJsons()) {
      let json: unknown;
      try {
        json = JSON.parse(readFileSync(aj, 'utf8'));
      } catch {
        continue;
      }
      const projects = (json as { projects?: Record<string, { root?: string; sourceRoot?: string }> }).projects;
      if (!projects) continue;
      const base = dirname(aj);
      for (const name of Object.keys(projects)) {
        const root = projects[name]?.root ?? projects[name]?.sourceRoot ?? '';
        result.push({ name, root: toPosix(relative(this.repoRoot, join(base, root))) });
      }
    }
    // Root mais específico primeiro, para o match por prefixo escolher o certo.
    result.sort((a, b) => b.root.length - a.root.length);
    return result;
  }

  private findAngularJsons(): string[] {
    const out: string[] = [];
    const walk = (dir: string): void => {
      let ents: Dirent[];
      try {
        ents = readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const ent of ents) {
        const full = join(dir, ent.name);
        if (ent.isDirectory()) {
          if (!SKIP_DIRS.has(ent.name)) walk(full);
        } else if (ent.isFile() && ent.name === 'angular.json') {
          out.push(full);
        }
      }
    };
    walk(this.repoRoot);
    return out;
  }
}

function projectOf(rel: string, projects: ProjectRoot[]): string | undefined {
  for (const p of projects) {
    if (p.root === '') {
      // angular.json na raiz sem `root` declarado: só casa se for o único projeto.
      if (projects.length === 1) return p.name;
      continue;
    }
    if (rel === p.root || rel.startsWith(`${p.root}/`)) return p.name;
  }
  return undefined;
}

function readDecorator(dec: Decorator): { selector?: string; templateUrl?: string } {
  const arg = dec.getArguments()[0];
  const res: { selector?: string; templateUrl?: string } = {};
  if (arg && Node.isObjectLiteralExpression(arg)) {
    for (const prop of arg.getProperties()) {
      if (!Node.isPropertyAssignment(prop)) continue;
      const name = prop.getName();
      if (name === 'selector') {
        const s = literalText(prop.getInitializer());
        if (s) res.selector = s;
      } else if (name === 'templateUrl') {
        const s = literalText(prop.getInitializer());
        if (s) res.templateUrl = s;
      }
    }
  }
  return res;
}

function literalText(node: Node | undefined): string | null {
  if (!node) return null;
  if (Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node)) {
    return node.getLiteralText();
  }
  return null;
}

function safeMtime(file: string): number {
  try {
    return statSync(file).mtimeMs;
  } catch {
    return 0;
  }
}

/** Normaliza separadores para posix — o SourceRef trafega no protocolo. */
function toPosix(p: string): string {
  return p.split('\\').join('/');
}
