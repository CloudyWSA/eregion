import { z } from 'zod';
import { AngularIndex } from './angular-index.js';
import { PROTOCOL_VERSION, SelectionPayload } from './selection-payload.js';

// ---------------------------------------------------------------------------
// Cliente → daemon
// ---------------------------------------------------------------------------

export const ClientMessage = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('hello'),
    payload: z.object({
      token: z.string().min(1),
      projectFingerprint: z.string().optional(),
    }),
  }),
  // Só alimenta o cache do daemon — nunca dispara a IA.
  z.object({
    type: z.literal('selection.update'),
    payload: z.object({ payload: SelectionPayload }),
  }),
  z.object({
    type: z.literal('chat.send'),
    // jobId correlaciona os eventos da resposta (pool de sessões paralelas).
    payload: z.object({
      text: z.string().min(1),
      attachSelection: z.boolean(),
      jobId: z.string().optional(),
      /** id de ModelOption; ausente = modelo default da conta do dev. */
      model: z.string().optional(),
    }),
  }),
  z.object({ type: z.literal('chat.cancel'), payload: z.object({ jobId: z.string().optional() }) }),
  z.object({
    type: z.literal('permission.respond'),
    payload: z.object({
      requestId: z.string().min(1),
      allow: z.boolean(),
      remember: z.boolean().optional(),
    }),
  }),
  z.object({
    type: z.literal('mode.set'),
    payload: z.object({ mode: z.enum(['auto', 'review']) }),
  }),
  z.object({
    type: z.literal('changes.revert'),
    payload: z.object({ checkpointId: z.string().min(1) }),
  }),
  // Overlay pede o índice Angular (apps Angular apenas; React ignora).
  z.object({ type: z.literal('angular.index.get'), payload: z.object({}) }),
]);
export type ClientMessage = z.infer<typeof ClientMessage>;

// ---------------------------------------------------------------------------
// Daemon → cliente
// ---------------------------------------------------------------------------

/** Modelo disponível no Claude Code do dev — descoberto em runtime, nunca hardcoded. */
export const ModelOption = z.object({
  /** id aceito pela API/setModel (ex: 'sonnet', 'default') */
  id: z.string(),
  /** nome de exibição (ex: 'Sonnet') */
  name: z.string(),
});
export type ModelOption = z.infer<typeof ModelOption>;

export const ChatUsage = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cacheReadTokens: z.number().int().nonnegative(),
  costUsd: z.number().nonnegative().optional(),
});
export type ChatUsage = z.infer<typeof ChatUsage>;

export const DaemonMessage = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('hello.ok'),
    payload: z.object({
      sessionId: z.string().nullable(),
      model: z.string(),
      cwd: z.string(),
      /** Pode chegar vazio se a descoberta ainda está em andamento — ver models.update. */
      models: z.array(ModelOption).optional(),
    }),
  }),
  z.object({
    type: z.literal('hello.error'),
    payload: z.object({
      code: z.enum(['bad_token', 'origin_denied']),
      message: z.string(),
    }),
  }),
  z.object({
    type: z.literal('chat.delta'),
    payload: z.object({ text: z.string(), jobId: z.string().optional() }),
  }),
  z.object({
    type: z.literal('chat.tool'),
    payload: z.object({
      name: z.string(),
      label: z.string(),
      status: z.enum(['running', 'done', 'error']),
      jobId: z.string().optional(),
    }),
  }),
  z.object({
    type: z.literal('chat.result'),
    payload: z.object({ usage: ChatUsage, durationMs: z.number().nonnegative(), jobId: z.string().optional() }),
  }),
  z.object({
    type: z.literal('edit.applied'),
    payload: z.object({
      file: z.string(),
      diff: z.string(),
      checkpointId: z.string().optional(),
      jobId: z.string().optional(),
    }),
  }),
  z.object({
    type: z.literal('permission.request'),
    payload: z.object({
      requestId: z.string().min(1),
      toolName: z.string(),
      summary: z.string(),
      diff: z.string().optional(),
    }),
  }),
  z.object({
    type: z.literal('status'),
    payload: z.object({
      state: z.enum(['idle', 'thinking', 'editing', 'waiting_approval', 'queued']),
    }),
  }),
  z.object({
    type: z.literal('error'),
    payload: z.object({
      code: z.string(),
      message: z.string(),
      retryAfterMs: z.number().nonnegative().optional(),
      jobId: z.string().optional(),
    }),
  }),
  z.object({
    type: z.literal('angular.index'),
    payload: z.object({ index: AngularIndex }),
  }),
  z.object({
    type: z.literal('models.update'),
    payload: z.object({ models: z.array(ModelOption) }),
  }),
]);
export type DaemonMessage = z.infer<typeof DaemonMessage>;

// ---------------------------------------------------------------------------
// Envelope
// ---------------------------------------------------------------------------

export const Envelope = z.object({
  v: z.literal(PROTOCOL_VERSION),
  /** Correlaciona requisição/resposta; gerado pelo remetente. */
  id: z.string().min(1),
  type: z.string().min(1),
  payload: z.unknown(),
});
export type Envelope = z.infer<typeof Envelope>;

export type ParseResult<T> = { ok: true; msg: T & { id: string } } | { ok: false; error: string };

function parseWith<T extends { type: string; payload: unknown }>(
  schema: z.ZodType<T>,
  raw: unknown,
): ParseResult<T> {
  const env = Envelope.safeParse(raw);
  if (!env.success) return { ok: false, error: `envelope inválido: ${env.error.issues[0]?.message}` };
  const msg = schema.safeParse({ type: env.data.type, payload: env.data.payload });
  if (!msg.success) {
    const issue = msg.error.issues[0];
    return { ok: false, error: `mensagem '${env.data.type}' inválida: ${issue?.path.join('.')} ${issue?.message}` };
  }
  return { ok: true, msg: { ...msg.data, id: env.data.id } };
}

export function parseClientMessage(raw: unknown): ParseResult<ClientMessage> {
  return parseWith(ClientMessage, raw);
}

export function parseDaemonMessage(raw: unknown): ParseResult<DaemonMessage> {
  return parseWith(DaemonMessage, raw);
}

/** O `id` vem de fora (determinismo/testabilidade — nada de Math.random aqui). */
export function makeEnvelope<T extends ClientMessage | DaemonMessage>(
  id: string,
  msg: T,
): Envelope {
  return { v: PROTOCOL_VERSION, id, type: msg.type, payload: msg.payload };
}
