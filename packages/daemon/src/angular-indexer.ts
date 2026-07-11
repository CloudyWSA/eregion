import { readdirSync, readFileSync, statSync, watch as fsWatch, type Dirent, type FSWatcher } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { Node, Project, type Decorator } from 'ts-morph';
import type { AngularComponentEntry, AngularIndex } from '@eregion/protocol';

// Directories that never hold relevant app source — skipping them cuts the scan cost.
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.turbo', 'coverage', '.angular', '.eregion']);
const STALE_CHECK_THROTTLE_MS = 1_000;

interface ProjectRoot {
  name: string;
  /** Path relative to repoRoot, posix separators; '' = repo root. */
  root: string;
}

/**
 * Static index of Angular components/directives (syntactic ts-morph parse of
 * @Component/@Directive decorators — the app build is not touched). Stamps
 * each entry with its origin project (angular.json) and serves a cached index.
 */
export class AngularIndexer {
  private cache: AngularIndex | null = null;
  /** mtimes of indexed files from the last build (for cheap invalidation). */
  private mtimes = new Map<string, number>();
  private lastCheckMs = 0;
  private watcher: FSWatcher | null = null;

  constructor(private readonly repoRoot: string) {}

  /** Forces a full rebuild and returns the index. */
  build(): AngularIndex {
    return this.rebuild();
  }

  /**
   * Cached index. Rebuilds on the first call and when an already-indexed file
   * changed mtime (check throttled to 1×/s). New files are caught by the
   * optional watch(), which invalidates the cache.
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
   * Watches repoRoot and invalidates the cache when .ts/.html/angular.json
   * change. Recursive fs.watch isn't available on every OS; on failure it
   * degrades to a no-op (getIndex's mtime check still covers edits to
   * already-indexed files).
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
    // Pure syntactic ts-morph: no tsconfig, no type-checker; releases each
    // SourceFile after extracting so we don't hold 900 ASTs in memory.
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
          // Line of the class declaration (not the decorator, which precedes it).
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

  /** Rebuilds only if an indexed file vanished or changed mtime. */
  private isStale(): boolean {
    for (const [file, prev] of this.mtimes) {
      if (safeMtime(file) !== prev) return true;
    }
    return false;
  }

  /**
   * .ts files (outside SKIP_DIRS, .d.ts and .spec.ts) that mention the
   * decorators. The substring pre-filter avoids handing 2/3 of the files to
   * ts-morph — the real bottleneck is the parse, not the read.
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
   * Projects declared in the repo's angular.json file(s). Angular monorepos
   * often have several near-duplicate apps — the origin project is what lets
   * us disambiguate later.
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
    // Most specific root first, so the prefix match picks the right one.
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
      // angular.json at the root with no declared `root`: matches only if it's the single project.
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

/** Normalizes separators to posix — the SourceRef travels over the protocol. */
function toPosix(p: string): string {
  return p.split('\\').join('/');
}
