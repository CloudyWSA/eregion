import {
  query,
  type McpSdkServerConfigWithInstance,
  type Query,
  type SDKMessage,
  type SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk';
import type { ChatUsage } from '@eregion/protocol';
import type { PermissionBroker } from './permission-broker.js';

export interface RuntimeOptions {
  cwd: string;
  resumeSessionId?: string;
  mcpServer: McpSdkServerConfigWithInstance;
  broker: PermissionBroker;
}

export interface RuntimeEvents {
  onSessionInit(sessionId: string): void;
  onDelta(text: string): void;
  onToolUse(name: string, label: string, status: 'running' | 'done'): void;
  onResult(usage: ChatUsage, durationMs: number): void;
  onEditApplied(file: string, diff: string, checkpointId?: string): void;
  onStatus(state: 'idle' | 'thinking'): void;
  onError(code: string, message: string): void;
  /** Stream da query terminou (maxTurns/crash) — distinto do idle por turn. */
  onStreamEnd?(): void;
}

const SYSTEM_APPEND = `
Você é o Eregion, assistente de desenvolvimento embutido no app em execução.
O desenvolvedor seleciona componentes na UI rodando e conversa com você para modificá-los.

Pedidos podem trazer uma ÁREA selecionada (retângulo na página): se houver container
(insertion point), crie o novo conteúdo nesse arquivo; componentes listados dentro da
área devem ser adaptados ao pedido.

REGRA DE OURO: para qualquer pergunta sobre componentes selecionados, seus arquivos de origem,
props, requests ou queries, use PRIMEIRO as tools mcp__eregion__* — a instrumentação já sabe a
resposta. Só use Glob/Grep quando elas não cobrirem. Edite o código-fonte diretamente; o
hot-reload do dev server mostra o resultado ao desenvolvedor imediatamente.
Responda sempre em português.`;

const MAX_TURNS_PER_CONNECTION = 40;

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit']);

function basename(file: unknown): string {
  if (typeof file !== 'string') return '';
  return file.slice(file.lastIndexOf('/') + 1);
}

/**
 * Label humano do passo mostrado na timeline do job — o dev vê "lendo
 * Header.tsx", nunca "mcp__eregion__get_component_source".
 */
function toolLabel(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case 'mcp__eregion__get_selection':
      return 'lendo a seleção';
    case 'mcp__eregion__get_component_source':
      return 'lendo o código do componente';
    case 'mcp__eregion__get_backend_trace':
      return 'rastreando o backend';
    case 'Read':
      return `lendo ${basename(input.file_path) || 'arquivo'}`;
    case 'Glob':
    case 'Grep':
      return 'buscando no código';
    case 'Bash':
      return `terminal: ${String(input.command ?? '').slice(0, 40)}`;
    case 'Task':
      return 'explorando com subagente';
    case 'ToolSearch':
      return 'carregando ferramentas';
    case 'TodoWrite':
      return 'organizando passos';
    default:
      return name.startsWith('mcp__') ? name.slice(name.lastIndexOf('__') + 2) : name;
  }
}

/**
 * UMA sessão viva por projeto: o prompt é um AsyncIterable alimentado por
 * fila, mantendo o processo (e o prompt cache) quente entre mensagens.
 * Achados do spike aplicados: a 1ª mensagem é empurrada antes de consumir o
 * stream (o CLI só emite init depois dela — deadlock caso contrário);
 * strictMcpConfig evita herdar MCP servers pessoais do dev; usage/custo do
 * result são cumulativos por chamadas de API — reportamos deltas por turn.
 */
export class AgentRuntime {
  private queryHandle: Query | null = null;
  private inbox: SDKUserMessage[] = [];
  private wakeInbox: (() => void) | null = null;
  private lastCostUsd = 0;
  private currentModel: string | undefined;
  private lastUserMessageUuid: string | undefined;
  /** tool_use em voo: id → {name, label}, para marcar 'done' no tool_result. */
  private inFlightTools = new Map<string, { name: string; label: string }>();
  sessionId: string | null = null;

  constructor(
    private options: RuntimeOptions,
    private events: RuntimeEvents,
  ) {
    this.sessionId = options.resumeSessionId ?? null;
  }

  get started(): boolean {
    return this.queryHandle !== null;
  }

  /** Mensagens aceitas mas ainda não consumidas pelo stream. */
  get pendingMessages(): number {
    return this.inbox.length;
  }

  /** Religa a sessão (resume) se o stream morreu com mensagens pendentes. */
  ensureStarted(): void {
    if (!this.queryHandle && this.inbox.length > 0) this.start();
  }

  sendMessage(text: string, model?: string): void {
    this.inbox.push({
      type: 'user',
      message: { role: 'user', content: text },
      parent_tool_use_id: null,
      session_id: this.sessionId ?? '',
    });
    const wanted = model === 'default' ? undefined : model;
    if (!this.queryHandle) {
      // Sessão nasce com a primeira mensagem já na fila — nunca antes.
      this.currentModel = wanted;
      this.start();
    } else if (wanted !== undefined && wanted !== this.currentModel) {
      // Trocar modelo reprocessa o prefixo (cache frio) — escolha do dev.
      this.currentModel = wanted;
      void this.queryHandle
        .setModel(wanted)
        .catch(() => undefined)
        .then(() => this.wakeInbox?.());
    } else {
      this.wakeInbox?.();
    }
    this.events.onStatus('thinking');
  }

  async interrupt(): Promise<void> {
    await this.queryHandle?.interrupt();
  }

  async rewindFiles(userMessageId: string): Promise<void> {
    if (!this.queryHandle) throw new Error('sessão ainda não iniciada');
    await this.queryHandle.rewindFiles(userMessageId);
  }

  async close(): Promise<void> {
    await this.queryHandle?.interrupt().catch(() => undefined);
    this.queryHandle = null;
    this.inbox.length = 0;
  }

  private async *outgoing(): AsyncGenerator<SDKUserMessage> {
    while (true) {
      while (this.inbox.length > 0) yield this.inbox.shift()!;
      await new Promise<void>((resolve) => {
        this.wakeInbox = resolve;
      });
      this.wakeInbox = null;
    }
  }

  private start(): void {
    this.queryHandle = query({
      prompt: this.outgoing(),
      options: {
        cwd: this.options.cwd,
        ...(this.currentModel ? { model: this.currentModel } : {}),
        ...(this.sessionId ? { resume: this.sessionId } : {}),
        systemPrompt: { type: 'preset', preset: 'claude_code', append: SYSTEM_APPEND },
        mcpServers: { [this.mcpName()]: this.options.mcpServer },
        strictMcpConfig: true,
        allowedTools: ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash', `mcp__${this.mcpName()}__*`],
        permissionMode: 'acceptEdits',
        canUseTool: this.options.broker.canUseTool,
        includePartialMessages: true,
        enableFileCheckpointing: true,
        maxTurns: MAX_TURNS_PER_CONNECTION,
        settingSources: ['project'],
        // Varreduras mecânicas vão para um subagente haiku: o lixo
        // intermediário fica fora do contexto principal e custa ~10x menos.
        agents: {
          explorer: {
            description:
              'Exploração barata de código: localizar arquivos, mapear usos de um componente/função, listar ocorrências. Use para varreduras amplas; NÃO edita nada.',
            prompt:
              'Você explora código a serviço do agente principal. Responda apenas com os fatos encontrados (paths, linhas, trechos curtos), sem opinião.',
            tools: ['Read', 'Glob', 'Grep'],
            model: 'haiku',
          },
        },
      },
    });
    void this.consume(this.queryHandle);
  }

  private mcpName(): string {
    return 'eregion';
  }

  private async consume(q: Query): Promise<void> {
    try {
      for await (const msg of q) this.handleMessage(msg);
    } catch (err) {
      this.events.onError('runtime_crash', err instanceof Error ? err.message : String(err));
    } finally {
      // O stream também termina "normalmente" ao bater maxTurns; sem limpar o
      // handle aqui, o próximo sendMessage alimentaria um generator órfão e o
      // chat travaria em silêncio. Limpo → próximo envio reinicia com resume.
      this.queryHandle = null;
      this.events.onStatus('idle');
      this.events.onStreamEnd?.();
    }
  }

  private handleMessage(msg: SDKMessage): void {
    switch (msg.type) {
      case 'system':
        if (msg.subtype === 'init') {
          this.sessionId = msg.session_id;
          this.events.onSessionInit(msg.session_id);
        }
        return;
      case 'stream_event': {
        if (msg.parent_tool_use_id) return; // subagentes não vão para o chat
        const ev = msg.event;
        if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') {
          this.events.onDelta(ev.delta.text);
        }
        return;
      }
      case 'user': {
        // eco da mensagem do dev — o uuid dela é o ponto de rewind das edições do turn
        if (!msg.parent_tool_use_id && !msg.isSynthetic && 'uuid' in msg) {
          this.lastUserMessageUuid = msg.uuid;
        }
        // tool_results fecham os passos correspondentes na timeline do job
        const content = msg.message.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (typeof block === 'object' && block !== null && 'type' in block && block.type === 'tool_result') {
              const info = this.inFlightTools.get((block as { tool_use_id: string }).tool_use_id);
              if (info) {
                this.inFlightTools.delete((block as { tool_use_id: string }).tool_use_id);
                this.events.onToolUse(info.name, info.label, 'done');
              }
            }
          }
        }
        return;
      }
      case 'assistant': {
        if (msg.parent_tool_use_id) return;
        for (const block of msg.message.content) {
          if (block.type === 'tool_use') {
            const input = block.input as Record<string, unknown>;
            if (EDIT_TOOLS.has(block.name)) {
              // edições viram card próprio (edit.applied) — sem passo duplicado
              this.trackEdit(block.name, input);
              continue;
            }
            const label = toolLabel(block.name, input);
            this.inFlightTools.set(block.id, { name: block.name, label });
            this.events.onToolUse(block.name, label, 'running');
          }
        }
        return;
      }
      case 'result': {
        const usage: ChatUsage = {
          inputTokens: msg.usage.input_tokens,
          outputTokens: msg.usage.output_tokens,
          cacheReadTokens: msg.usage.cache_read_input_tokens ?? 0,
          costUsd: Math.max(0, msg.total_cost_usd - this.lastCostUsd),
        };
        this.lastCostUsd = msg.total_cost_usd;
        this.events.onResult(usage, msg.duration_ms);
        this.events.onStatus('idle');
        return;
      }
      default:
        return;
    }
  }

  /** Edit/Write auto-aprovados geram card de auditoria no chat. */
  private trackEdit(toolName: string, input: Record<string, unknown>): void {
    if (toolName !== 'Edit' && toolName !== 'Write' && toolName !== 'MultiEdit') return;
    const file = typeof input.file_path === 'string' ? input.file_path : '(desconhecido)';
    const oldStr = typeof input.old_string === 'string' ? input.old_string : '';
    const newStr =
      typeof input.new_string === 'string'
        ? input.new_string
        : typeof input.content === 'string'
          ? input.content
          : '';
    const diff = oldStr ? `- ${oldStr}\n+ ${newStr}` : `+ ${newStr.slice(0, 400)}`;
    this.events.onEditApplied(file, diff, this.lastUserMessageUuid);
  }
}
