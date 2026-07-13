import { z } from 'zod';
import { AngularIndex } from './angular-index.js';
import { PROTOCOL_VERSION, SelectionPayload } from './selection-payload.js';

// ---------------------------------------------------------------------------
// Client → daemon
// ---------------------------------------------------------------------------

/** ~2MB decoded — bigger images blow the context budget and the frame size. */
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/** Approximate decoded byte length of a base64 string (ignoring whitespace). */
function base64Bytes(data: string): number {
  const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0;
  return Math.floor((data.length * 3) / 4) - padding;
}

export const ChatImage = z
  .object({
    /** e.g. 'image/png', 'image/jpeg' */
    mediaType: z.string().min(1),
    /** base64-encoded bytes (no data: URI prefix) */
    data: z.string().min(1),
  })
  .refine((img) => base64Bytes(img.data) <= MAX_IMAGE_BYTES, {
    message: 'image exceeds 2MB',
    path: ['data'],
  });
export type ChatImage = z.infer<typeof ChatImage>;

export const ClientMessage = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('hello'),
    payload: z.object({
      token: z.string().min(1),
      projectFingerprint: z.string().optional(),
    }),
  }),
  // Feeds the daemon cache only — never triggers the AI.
  z.object({
    type: z.literal('selection.update'),
    payload: z.object({ payload: SelectionPayload }),
  }),
  z.object({
    type: z.literal('chat.send'),
    // jobId correlates the response events (parallel session pool).
    payload: z.object({
      text: z.string().min(1),
      attachSelection: z.boolean(),
      jobId: z.string().optional(),
      /** ModelOption id; absent = the dev account's default model. */
      model: z.string().optional(),
      /** jobId of the turn being replied to — routes to the same session. */
      replyTo: z.string().optional(),
      /** Inline images (base64), max 2MB each and 4 per message. */
      images: z.array(ChatImage).max(4).optional(),
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
    // auto: edits in the workspace pass, Bash asks · review: every edit asks ·
    // yolo: auto-approve everything, including Bash.
    payload: z.object({ mode: z.enum(['auto', 'review', 'yolo']) }),
  }),
  z.object({
    type: z.literal('changes.revert'),
    payload: z.object({ checkpointId: z.string().min(1) }),
  }),
  // Angular apps only — React ignores this.
  z.object({ type: z.literal('angular.index.get'), payload: z.object({}) }),
]);
export type ClientMessage = z.infer<typeof ClientMessage>;

// ---------------------------------------------------------------------------
// Daemon → client
// ---------------------------------------------------------------------------

/** Model available in the dev's Claude Code — discovered at runtime, never hardcoded. */
export const ModelOption = z.object({
  /** id accepted by the API/setModel (e.g. 'sonnet', 'default') */
  id: z.string(),
  /** display name (e.g. 'Sonnet') */
  name: z.string(),
});
export type ModelOption = z.infer<typeof ModelOption>;

/** Skill/slash-command available in the dev's Claude Code — discovered at runtime. */
export const SkillOption = z.object({
  /** command name without the leading slash (also used as id) */
  id: z.string(),
  /** display name (same as id today, kept separate for the UI) */
  name: z.string(),
  /** what the skill does */
  description: z.string(),
  /** hint for arguments (e.g. '<file>') */
  argumentHint: z.string().optional(),
});
export type SkillOption = z.infer<typeof SkillOption>;

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
      /** May arrive empty while discovery is still running — see models.update. */
      models: z.array(ModelOption).optional(),
      /** May arrive empty while discovery is still running — see models.update. */
      skills: z.array(SkillOption).optional(),
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
    payload: z.object({
      models: z.array(ModelOption),
      skills: z.array(SkillOption).optional(),
    }),
  }),
  z.object({
    type: z.literal('chat.plan'),
    payload: z.object({
      items: z.array(
        z.object({
          text: z.string(),
          status: z.enum(['pending', 'in_progress', 'completed']),
        }),
      ),
      jobId: z.string().optional(),
    }),
  }),
  z.object({
    type: z.literal('usage.update'),
    payload: z.object({
      jobs: z.number().int().nonnegative(),
      outputTokens: z.number().int().nonnegative(),
      costUsd: z.number().nonnegative(),
    }),
  }),
]);
export type DaemonMessage = z.infer<typeof DaemonMessage>;

// ---------------------------------------------------------------------------
// Envelope
// ---------------------------------------------------------------------------

export const Envelope = z.object({
  v: z.literal(PROTOCOL_VERSION),
  /** Correlates request/response; generated by the sender. */
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
  if (!env.success) return { ok: false, error: `invalid envelope: ${env.error.issues[0]?.message}` };
  const msg = schema.safeParse({ type: env.data.type, payload: env.data.payload });
  if (!msg.success) {
    const issue = msg.error.issues[0];
    return { ok: false, error: `invalid '${env.data.type}' message: ${issue?.path.join('.')} ${issue?.message}` };
  }
  return { ok: true, msg: { ...msg.data, id: env.data.id } };
}

export function parseClientMessage(raw: unknown): ParseResult<ClientMessage> {
  return parseWith(ClientMessage, raw);
}

export function parseDaemonMessage(raw: unknown): ParseResult<DaemonMessage> {
  return parseWith(DaemonMessage, raw);
}

/** The `id` comes from outside (determinism/testability — no Math.random here). */
export function makeEnvelope<T extends ClientMessage | DaemonMessage>(
  id: string,
  msg: T,
): Envelope {
  return { v: PROTOCOL_VERSION, id, type: msg.type, payload: msg.payload };
}
