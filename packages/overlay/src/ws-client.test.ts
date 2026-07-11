// @vitest-environment jsdom
import { makeEnvelope, type DaemonMessage } from '@eregion/protocol';
import { describe, expect, it } from 'vitest';
import { EregionClient } from './ws-client.js';

// jsdom não tem WebSocket — dublê mínimo controlável pelo teste
class FakeSocket {
  static OPEN = 1;
  readyState = 1;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  send(raw: string): void {
    this.sent.push(raw);
  }
  close(): void {}
  receive(msg: DaemonMessage): void {
    this.onmessage?.({ data: JSON.stringify(makeEnvelope('d1', msg)) });
  }
}

(globalThis as Record<string, unknown>).WebSocket = FakeSocket;

describe('EregionClient', () => {
  it('reprisa mensagens de estado para handlers registrados depois', () => {
    const socket = new FakeSocket();
    const client = new EregionClient({ port: 1, token: 't', createSocket: () => socket as unknown as WebSocket });
    client.connect();
    socket.onopen?.();
    socket.receive({
      type: 'hello.ok',
      payload: { sessionId: null, model: 'default', cwd: '/r', models: [{ id: 'sonnet', name: 'Sonnet' }] },
    });

    // handler tardio (como o chat-ui após import dinâmico)
    const recebidos: string[] = [];
    client.onMessage((m) => recebidos.push(m.type));
    expect(recebidos).toEqual(['hello.ok']);
  });

  it('eventos efêmeros (deltas) NÃO são reprisados', () => {
    const socket = new FakeSocket();
    const client = new EregionClient({ port: 1, token: 't', createSocket: () => socket as unknown as WebSocket });
    client.connect();
    socket.onopen?.();
    socket.receive({ type: 'chat.delta', payload: { text: 'oi' } });
    const recebidos: string[] = [];
    client.onMessage((m) => recebidos.push(m.type));
    expect(recebidos).toEqual([]);
  });
});
