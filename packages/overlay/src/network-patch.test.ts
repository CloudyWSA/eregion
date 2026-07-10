// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetNetworkBuffer,
  installNetworkPatch,
  recentHttpActivity,
  recentRequests,
} from './network-patch.js';

// Configurável por teste; o patch chama o fetch capturado no install, que
// delega para cá — assim conseguimos inspecionar o init recebido.
let lastInit: RequestInit | undefined;
let respondStatus = 200;

const ALLOWED = 'http://allowed.example';

beforeAll(() => {
  window.fetch = ((_input: RequestInfo | URL, init?: RequestInit) => {
    lastInit = init;
    return Promise.resolve(new Response('ok', { status: respondStatus }));
  }) as typeof fetch;
  // Neutraliza o send real do jsdom (evita rede); mantém o open real p/ estado.
  XMLHttpRequest.prototype.send = function () {};
  installNetworkPatch({ traceOrigins: [ALLOWED] });
});

beforeEach(() => {
  __resetNetworkBuffer();
  lastInit = undefined;
  respondStatus = 200;
});

function traceparentOf(init: RequestInit | undefined): string | null {
  const h = init?.headers;
  return h instanceof Headers ? h.get('traceparent') : null;
}

describe('installNetworkPatch (fetch)', () => {
  it('injeta traceparent válido em same-origin e registra no buffer', async () => {
    await window.fetch('/api/orders');
    const tp = traceparentOf(lastInit);
    expect(tp).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);

    const reqs = recentRequests();
    expect(reqs).toHaveLength(1);
    expect(reqs[0]).toMatchObject({ method: 'GET', url: '/api/orders', status: 200 });
    expect(reqs[0].traceId).toHaveLength(32);
  });

  it('injeta em origem da allowlist', async () => {
    await window.fetch(`${ALLOWED}/data`);
    expect(traceparentOf(lastInit)).toMatch(/^00-[0-9a-f]{32}/);
  });

  it('NÃO injeta em cross-origin fora da allowlist (mas registra a request)', async () => {
    await window.fetch('http://other.example/x');
    expect(traceparentOf(lastInit)).toBeNull();
    const reqs = recentRequests();
    expect(reqs).toHaveLength(1);
    expect(reqs[0].traceId).toBeUndefined();
  });

  it('é idempotente: chamar de novo não re-patcha window.fetch', () => {
    const before = window.fetch;
    installNetworkPatch();
    expect(window.fetch).toBe(before);
  });

  it('ring buffer limita a 200 e recentHttpActivity formata as últimas', async () => {
    for (let i = 0; i < 205; i++) await window.fetch(`/api/n/${i}`);
    expect(recentRequests()).toHaveLength(200);

    const activity = recentHttpActivity(3);
    expect(activity).toHaveLength(3);
    expect(activity[2].req).toMatch(/^GET \/api\/n\/204 → 200 \(\d+ms\)$/);
    expect(activity[2].traceId).toHaveLength(32);
  });
});

describe('installNetworkPatch (XMLHttpRequest)', () => {
  it('injeta traceparent same-origin e registra no loadend', () => {
    const xhr = new XMLHttpRequest();
    const spy = vi.spyOn(xhr, 'setRequestHeader');
    xhr.open('POST', '/api/save');
    xhr.send();

    const call = spy.mock.calls.find(([name]) => name === 'traceparent');
    expect(call?.[1]).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);

    xhr.dispatchEvent(new Event('loadend'));
    const reqs = recentRequests();
    expect(reqs.at(-1)).toMatchObject({ method: 'POST', url: '/api/save' });
  });
});
