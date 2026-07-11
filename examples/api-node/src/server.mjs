// Mock backend for testing the frontend→backend trace without a database.
// Note: in plain Node ESM, http auto-instrumentation needs a loader hook, so
// this example opens the SERVER span manually (same shape withEregionTrace
// uses for Bun) and fakes the DB with a client span carrying real db.* attrs.
import { createServer } from 'node:http';
import { init } from '@eregion/node-agent';
import { context, propagation, trace, SpanKind } from '@opentelemetry/api';

init();
const tracer = trace.getTracer('example-api');

const ORDERS = [
  { id: 'O-201', customer: 'ACME Ltd', total: 1250.0 },
  { id: 'O-202', customer: 'Wayne S.A.', total: 380.0 },
];

function fakeQuery(statement, rows) {
  const span = tracer.startSpan('db.query', {
    kind: SpanKind.CLIENT,
    attributes: { 'db.system': 'postgresql', 'db.statement': statement },
  });
  return new Promise((resolve) =>
    setTimeout(() => {
      span.end();
      resolve(rows);
    }, 12),
  );
}

const headerGetter = {
  get: (headers, key) => headers[key],
  keys: (headers) => Object.keys(headers),
};

const server = createServer(async (req, res) => {
  res.setHeader('access-control-allow-origin', req.headers.origin ?? '*');
  res.setHeader('access-control-allow-headers', 'traceparent, x-eg-trace, content-type');
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.url === '/api/orders') {
    const parentCtx = propagation.extract(context.active(), req.headers, headerGetter);
    const span = tracer.startSpan(
      `${req.method} ${req.url}`,
      { kind: SpanKind.SERVER, attributes: { 'http.method': req.method, 'http.target': req.url } },
      parentCtx,
    );
    const rows = await context.with(trace.setSpan(parentCtx, span), () =>
      fakeQuery("SELECT id, customer, total FROM orders WHERE status = 'open' LIMIT 50", ORDERS),
    );
    span.setAttribute('http.status_code', 200);
    span.end();
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(rows));
    return;
  }
  res.statusCode = 404;
  res.end();
});

server.listen(3199, '127.0.0.1', () => {
  console.log('example api on http://127.0.0.1:3199 (GET /api/orders)');
});
