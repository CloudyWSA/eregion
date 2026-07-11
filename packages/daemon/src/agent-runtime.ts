import { randomUUID } from 'node:crypto';
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
  /** The query stream ended (maxTurns/crash) — distinct from per-turn idle. */
  onStreamEnd?(): void;
}

const SYSTEM_APPEND = `
You are Eregion, the development assistant embedded in the running app.
The developer selects components in the running UI and talks to you to modify them.

Requests may include a selected AREA (a rectangle on the page): if there is a container
(insertion point), create the new content in that file; components listed inside the
area should be adapted to the request.

GOLDEN RULE: for any question about selected components, their source files, props,
requests or queries, use the mcp__eregion__* tools FIRST — the instrumentation already
knows the answer. Only use Glob/Grep when they don't cover it. Edit the source code
directly; the dev server's hot-reload shows the result to the developer immediately.
Reply in the developer's language.`;

const MAX_TURNS_PER_CONNECTION = 40;

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit']);

function basename(file: unknown): string {
  if (typeof file !== 'string') return '';
  return file.slice(file.lastIndexOf('/') + 1);
}

function toolLabel(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case 'mcp__eregion__get_selection':
      return 'reading selection';
    case 'mcp__eregion__get_component_source':
      return 'reading component code';
    case 'mcp__eregion__get_backend_trace':
      return 'tracing the backend';
    case 'Read':
      return `reading ${basename(input.file_path) || 'file'}`;
    case 'Glob':
    case 'Grep':
      return 'searching the code';
    case 'Bash':
      return `terminal: ${String(input.command ?? '').slice(0, 40)}`;
    case 'Task':
      return 'exploring with subagent';
    case 'ToolSearch':
      return 'loading tools';
    case 'TodoWrite':
      return 'organizing steps';
    default:
      return name.startsWith('mcp__') ? name.slice(name.lastIndexOf('__') + 2) : name;
  }
}

/**
 * One live session per project, kept warm (process + prompt cache) between
 * messages. The first message must be pushed before consuming the stream —
 * the CLI only emits init after it, deadlocking otherwise. strictMcpConfig
 * avoids inheriting the dev's personal MCP servers; result usage/cost is
 * cumulative across API calls, so we report per-turn deltas.
 */
export class AgentRuntime {
  private queryHandle: Query | null = null;
  private inbox: SDKUserMessage[] = [];
  private wakeInbox: (() => void) | null = null;
  private lastCostUsd = 0;
  private currentModel: string | undefined;
  private lastUserMessageUuid: string | undefined;
  /** In-flight tool_use: id → {name, label}, to mark 'done' on tool_result. */
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

  get pendingMessages(): number {
    return this.inbox.length;
  }

  /** Restarts the session (resume) if the stream died with pending messages. */
  ensureStarted(): void {
    if (!this.queryHandle && this.inbox.length > 0) this.start();
  }

  sendMessage(text: string, model?: string): void {
    // streaming input has no echo of the dev's message — we mint the uuid
    // ourselves so rewindFiles has a valid checkpoint to target
    const uuid = randomUUID();
    this.lastUserMessageUuid = uuid;
    this.inbox.push({
      type: 'user',
      uuid,
      message: { role: 'user', content: text },
      parent_tool_use_id: null,
      session_id: this.sessionId ?? '',
    } as SDKUserMessage);
    const wanted = model === 'default' ? undefined : model;
    if (!this.queryHandle) {
      // The session starts only with the first message already queued — never before.
      this.currentModel = wanted;
      this.start();
    } else if (wanted !== undefined && wanted !== this.currentModel) {
      // Changing model reprocesses the prefix (cold cache) — the dev's choice.
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
    if (!this.queryHandle) throw new Error('session not started yet');
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
        // No allowedTools: bare entries auto-approve before canUseTool runs,
        // silently bypassing the permission broker (bash approvals, review mode).
        permissionMode: 'default',
        canUseTool: this.options.broker.canUseTool,
        includePartialMessages: true,
        enableFileCheckpointing: true,
        maxTurns: MAX_TURNS_PER_CONNECTION,
        settingSources: ['project'],
        // Mechanical scans go to a haiku subagent: intermediate junk stays out
        // of the main context and costs ~10x less.
        agents: {
          explorer: {
            description:
              'Cheap code exploration: locate files, map uses of a component/function, list occurrences. Use for broad scans; edits NOTHING.',
            prompt:
              'You explore code in service of the main agent. Reply only with the facts found (paths, lines, short snippets), no opinion.',
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
      // The stream also ends "normally" on maxTurns; not clearing the handle
      // here would feed the next sendMessage to an orphan generator and hang
      // the chat silently. Cleared → next send restarts with resume.
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
        if (msg.parent_tool_use_id) return; // subagents don't go to the chat
        const ev = msg.event;
        if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') {
          this.events.onDelta(ev.delta.text);
        }
        return;
      }
      case 'user': {
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
              // edits become their own card (edit.applied) — no duplicate step
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

  /** Auto-approved Edit/Write produce an audit card in the chat. */
  private trackEdit(toolName: string, input: Record<string, unknown>): void {
    if (toolName !== 'Edit' && toolName !== 'Write' && toolName !== 'MultiEdit') return;
    const file = typeof input.file_path === 'string' ? input.file_path : '(unknown)';
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
