import {
  makeEnvelope,
  parseDaemonMessage,
  type ClientMessage,
  type DaemonMessage,
} from '@eregion/protocol';

export type ConnectionStatus = 'connecting' | 'open' | 'closed';

type MessageHandler = (msg: DaemonMessage & { id: string }) => void;
type StatusHandler = (status: ConnectionStatus) => void;

export interface ClientOptions {
  port: number;
  token: string;
  /** Injetável para testes. */
  createSocket?: (url: string) => WebSocket;
}

const BACKOFF_MS = [500, 1000, 2000, 5000, 10000];

/**
 * Mensagens de ESTADO (não eventos): quem se inscreve depois delas terem
 * chegado precisa recebê-las mesmo assim — o chat-ui carrega por import
 * dinâmico e costuma perder o hello.ok da conexão inicial.
 */
const REPLAYABLE = new Set(['hello.ok', 'models.update', 'angular.index']);

/**
 * Cliente WS do overlay. Enfileira enquanto desconectado, reconecta com
 * backoff e re-envia o hello a cada reconexão.
 */
export class EregionClient {
  private ws: WebSocket | null = null;
  private queue: string[] = [];
  private nextId = 1;
  private attempts = 0;
  private closedByUser = false;
  private handlers = new Set<MessageHandler>();
  private statusHandlers = new Set<StatusHandler>();
  private replayCache = new Map<string, DaemonMessage & { id: string }>();
  private opts: ClientOptions;

  constructor(opts: ClientOptions) {
    this.opts = opts;
  }

  connect(): void {
    this.closedByUser = false;
    const url = `ws://127.0.0.1:${this.opts.port}/ws`;
    const make = this.opts.createSocket ?? ((u: string) => new WebSocket(u));
    this.emitStatus('connecting');
    const ws = make(url);
    this.ws = ws;
    ws.onopen = () => {
      this.attempts = 0;
      this.emitStatus('open');
      // hello sempre primeiro; depois drena a fila
      this.sendRaw(this.envelope({ type: 'hello', payload: { token: this.opts.token } }));
      const pending = this.queue.splice(0);
      for (const raw of pending) this.sendRaw(raw);
    };
    ws.onmessage = (ev) => {
      let data: unknown;
      try {
        data = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      const res = parseDaemonMessage(data);
      if (!res.ok) return;
      if (REPLAYABLE.has(res.msg.type)) this.replayCache.set(res.msg.type, res.msg);
      for (const fn of this.handlers) fn(res.msg);
    };
    ws.onclose = () => {
      this.ws = null;
      this.emitStatus('closed');
      if (this.closedByUser) return;
      const delay = BACKOFF_MS[Math.min(this.attempts, BACKOFF_MS.length - 1)]!;
      this.attempts += 1;
      setTimeout(() => this.connect(), delay);
    };
  }

  close(): void {
    this.closedByUser = true;
    this.ws?.close();
  }

  send(msg: ClientMessage): void {
    const raw = this.envelope(msg);
    if (this.ws?.readyState === WebSocket.OPEN) this.sendRaw(raw);
    else this.queue.push(raw);
  }

  onMessage(fn: MessageHandler): () => void {
    this.handlers.add(fn);
    for (const msg of this.replayCache.values()) fn(msg);
    return () => this.handlers.delete(fn);
  }

  onStatus(fn: StatusHandler): () => void {
    this.statusHandlers.add(fn);
    return () => this.statusHandlers.delete(fn);
  }

  private envelope(msg: ClientMessage): string {
    return JSON.stringify(makeEnvelope(`c${this.nextId++}`, msg));
  }

  private sendRaw(raw: string): void {
    this.ws?.send(raw);
  }

  private emitStatus(status: ConnectionStatus): void {
    for (const fn of this.statusHandlers) fn(status);
  }
}

export interface EregionGlobal {
  daemonPort: number;
  daemonToken: string;
  appName?: string;
}

declare global {
  interface Window {
    __EREGION__?: EregionGlobal;
  }
}
