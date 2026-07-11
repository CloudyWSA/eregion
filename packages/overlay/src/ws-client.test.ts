// @vitest-environment jsdom
import { makeEnvelope, type DaemonMessage } from '@eregion/protocol';
import { describe, expect, it } from 'vitest';
import { EregionClient } from './ws-client.js';

// jsdom has no WebSocket; a minimal test-controllable stub
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
  it('replays state messages to handlers registered afterwards', () => {
    const socket = new FakeSocket();
    const client = new EregionClient({ port: 1, token: 't', createSocket: () => socket as unknown as WebSocket });
    client.connect();
    socket.onopen?.();
    socket.receive({
      type: 'hello.ok',
      payload: { sessionId: null, model: 'default', cwd: '/r', models: [{ id: 'sonnet', name: 'Sonnet' }] },
    });

    // late handler (like the chat-ui after a dynamic import)
    const received: string[] = [];
    client.onMessage((m) => received.push(m.type));
    expect(received).toEqual(['hello.ok']);
  });

  it('ephemeral events (deltas) are NOT replayed', () => {
    const socket = new FakeSocket();
    const client = new EregionClient({ port: 1, token: 't', createSocket: () => socket as unknown as WebSocket });
    client.connect();
    socket.onopen?.();
    socket.receive({ type: 'chat.delta', payload: { text: 'hi' } });
    const received: string[] = [];
    client.onMessage((m) => received.push(m.type));
    expect(received).toEqual([]);
  });
});
