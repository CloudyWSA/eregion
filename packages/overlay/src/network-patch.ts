import type { HttpActivity } from '@eregion/protocol';

/** A request observed by the network patch, for backend correlation. */
export interface RequestRecord {
  /** Injected W3C traceId (absent when the origin was not in the allowlist). */
  traceId?: string;
  method: string;
  url: string;
  status: number;
  durationMs: number;
  /** Date.now() at the start of the request. */
  startedAt: number;
}

export interface NetworkPatchOptions {
  /** Origins (besides same-origin) that also receive the traceparent header. */
  traceOrigins?: string[];
}

const BUFFER_MAX = 200;
const HTTP_ACTIVITY_LIMIT = 5;

const buffer: RequestRecord[] = [];
let patched = false;

/** 16 bytes → 32 hex chars (traceId); 8 bytes → 16 (spanId). */
function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  let out = '';
  for (const b of arr) out += b.toString(16).padStart(2, '0');
  return out;
}

function makeTraceparent(): { traceId: string; header: string } {
  const traceId = randomHex(16);
  const spanId = randomHex(8);
  // 00 = version; 01 = sampled.
  return { traceId, header: `00-${traceId}-${spanId}-01` };
}

/** Injects the header only on same-origin or an explicitly allowed origin. */
function shouldTrace(url: string, origins: string[]): boolean {
  try {
    const u = new URL(url, location.href);
    return u.origin === location.origin || origins.includes(u.origin);
  } catch {
    return false;
  }
}

function record(entry: RequestRecord): void {
  buffer.push(entry);
  if (buffer.length > BUFFER_MAX) buffer.splice(0, buffer.length - BUFFER_MAX);
}

function urlToShortPath(url: string): string {
  try {
    const u = new URL(url, location.href);
    return u.pathname + u.search;
  } catch {
    return url;
  }
}

interface XhrMeta {
  method: string;
  url: string;
  traceId?: string;
  startedAt: number;
}

/**
 * Idempotent patch of window.fetch and XMLHttpRequest: generates a W3C traceId
 * per same-origin (or allowlisted) request, injects the `traceparent` header,
 * and records the request in a ring buffer. Links the frontend to the daemon's BackendTrace.
 */
export function installNetworkPatch(options: NetworkPatchOptions = {}): void {
  if (patched || typeof window === 'undefined') return;
  patched = true;
  const origins = options.traceOrigins ?? [];

  patchFetch(origins);
  patchXhr(origins);
}

function patchFetch(origins: string[]): void {
  const original = window.fetch;
  window.fetch = async function (
    this: unknown,
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = (
      init?.method ?? (input instanceof Request ? input.method : 'GET')
    ).toUpperCase();
    const startedAt = Date.now();

    let traceId: string | undefined;
    let finalInit = init;
    if (shouldTrace(url, origins)) {
      const tp = makeTraceparent();
      traceId = tp.traceId;
      const headers = new Headers(
        init?.headers ?? (input instanceof Request ? input.headers : undefined),
      );
      headers.set('traceparent', tp.header);
      finalInit = { ...init, headers };
    }

    try {
      const res = await original.call(window, input, finalInit);
      record({ traceId, method, url, status: res.status, durationMs: Date.now() - startedAt, startedAt });
      return res;
    } catch (err) {
      record({ traceId, method, url, status: 0, durationMs: Date.now() - startedAt, startedAt });
      throw err;
    }
  };
}

function patchXhr(origins: string[]): void {
  const meta = new WeakMap<XMLHttpRequest, XhrMeta>();
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (
    this: XMLHttpRequest,
    method: string,
    url: string | URL,
    ...rest: unknown[]
  ): void {
    meta.set(this, { method: String(method).toUpperCase(), url: String(url), startedAt: 0 });
    return (origOpen as (...a: unknown[]) => void).call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function (
    this: XMLHttpRequest,
    body?: Document | XMLHttpRequestBodyInit | null,
  ): void {
    const m = meta.get(this);
    if (m) {
      if (shouldTrace(m.url, origins)) {
        const tp = makeTraceparent();
        m.traceId = tp.traceId;
        try {
          this.setRequestHeader('traceparent', tp.header);
        } catch {
          // header could not be set (invalid state); proceed without a trace
        }
      }
      m.startedAt = Date.now();
      this.addEventListener('loadend', () => {
        record({
          traceId: m.traceId,
          method: m.method,
          url: m.url,
          status: this.status,
          durationMs: Date.now() - m.startedAt,
          startedAt: m.startedAt,
        });
      });
    }
    return (origSend as (b?: unknown) => void).call(this, body);
  };
}

/** Buffered requests, optionally only those started within the last `sinceMs`. */
export function recentRequests(sinceMs?: number): RequestRecord[] {
  if (sinceMs == null) return [...buffer];
  const cutoff = Date.now() - sinceMs;
  return buffer.filter((r) => r.startedAt >= cutoff);
}

/** Latest requests formatted as HttpActivity to attach to the payload. */
export function recentHttpActivity(limit: number = HTTP_ACTIVITY_LIMIT): HttpActivity[] {
  return buffer.slice(-limit).map((r) => ({
    req: `${r.method} ${urlToShortPath(r.url)} → ${r.status} (${r.durationMs}ms)`,
    traceId: r.traceId,
  }));
}

/** Tests only: clears the ring buffer. */
export function __resetNetworkBuffer(): void {
  buffer.length = 0;
}
