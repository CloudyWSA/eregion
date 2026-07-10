import path from 'node:path';
import type { CanUseTool, PermissionResult } from '@anthropic-ai/claude-agent-sdk';

export type PermissionMode = 'auto' | 'review';

export interface PermissionRequestEvent {
  requestId: string;
  toolName: string;
  summary: string;
  diff?: string;
}

interface PendingRequest {
  resolve(result: PermissionResult): void;
  timer: ReturnType<typeof setTimeout>;
}

const FS_EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const ALWAYS_ALLOWED = new Set(['Read', 'Glob', 'Grep', 'TodoWrite', 'Task']);
const APPROVAL_TIMEOUT_MS = 120_000;

function summarize(toolName: string, input: Record<string, unknown>): { summary: string; diff?: string } {
  if (toolName === 'Bash') {
    return { summary: String(input.command ?? '(comando desconhecido)') };
  }
  if (FS_EDIT_TOOLS.has(toolName)) {
    const file = String(input.file_path ?? input.notebook_path ?? '(arquivo desconhecido)');
    const oldStr = typeof input.old_string === 'string' ? input.old_string : null;
    const newStr = typeof input.new_string === 'string' ? input.new_string : null;
    const diff = oldStr !== null && newStr !== null ? `- ${oldStr}\n+ ${newStr}` : undefined;
    return { summary: `${toolName} em ${file}`, diff };
  }
  return { summary: `${toolName}(${JSON.stringify(input).slice(0, 200)})` };
}

/**
 * Ponte entre o `canUseTool` do Agent SDK e o modal de aprovação no overlay.
 *
 * Modo auto (default): edições de arquivo dentro dos workspaces passam sem
 * fricção (o card de diff no chat é auditoria, não bloqueio). Modo review:
 * toda edição pede aprovação. Bash e caminhos fora do workspace sempre pedem.
 */
export class PermissionBroker {
  mode: PermissionMode = 'auto';
  private pending = new Map<string, PendingRequest>();
  private nextId = 1;

  constructor(
    private workspaces: string[],
    private ask: (req: PermissionRequestEvent) => void,
  ) {}

  respond(requestId: string, allow: boolean): void {
    const req = this.pending.get(requestId);
    if (!req) return;
    this.pending.delete(requestId);
    clearTimeout(req.timer);
    req.resolve(
      allow
        ? { behavior: 'allow' }
        : { behavior: 'deny', message: 'Negado pelo desenvolvedor no overlay.' },
    );
  }

  private withinWorkspace(input: Record<string, unknown>): boolean {
    const file = input.file_path ?? input.notebook_path;
    if (typeof file !== 'string') return false;
    // Paths relativos do modelo são relativos ao cwd da sessão (o workspace),
    // não ao cwd do processo do daemon.
    const abs = path.resolve(this.workspaces[0] ?? process.cwd(), file);
    return this.workspaces.some((w) => abs === w || abs.startsWith(w + path.sep));
  }

  canUseTool: CanUseTool = async (toolName, input, { signal }) => {
    if (ALWAYS_ALLOWED.has(toolName) || toolName.startsWith('mcp__eregion__')) {
      return { behavior: 'allow' };
    }
    if (FS_EDIT_TOOLS.has(toolName) && this.mode === 'auto' && this.withinWorkspace(input)) {
      return { behavior: 'allow' };
    }
    return this.askOverlay(toolName, input, signal);
  };

  private askOverlay(
    toolName: string,
    input: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<PermissionResult> {
    const requestId = `p${this.nextId++}`;
    const { summary, diff } = summarize(toolName, input);
    return new Promise<PermissionResult>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        resolve({ behavior: 'deny', message: 'Aprovação expirou (120s) sem resposta no overlay.' });
      }, APPROVAL_TIMEOUT_MS);
      this.pending.set(requestId, { resolve, timer });
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        this.pending.delete(requestId);
        resolve({ behavior: 'deny', message: 'Turn interrompido.' });
      });
      this.ask({ requestId, toolName, summary, diff });
    });
  }
}
