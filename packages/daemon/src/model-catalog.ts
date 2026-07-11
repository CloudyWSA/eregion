import { query } from '@anthropic-ai/claude-agent-sdk';
import type { ModelOption } from '@eregion/protocol';

/**
 * Discovers the models allowed by the dev's account by asking Claude Code
 * itself (Query.supportedModels) — the list is never hardcoded and reflects
 * the active plan/managed settings. The probe uses a prompt that never
 * produces a message: the control channel replies before the first turn, at
 * zero cost.
 */
export async function discoverModels(cwd: string): Promise<ModelOption[]> {
  const never = (async function* () {
    await new Promise<never>(() => undefined);
  })();
  const probe = query({ prompt: never, options: { cwd, maxTurns: 1 } });
  try {
    const models = await probe.supportedModels();
    return models.map((m) => ({ id: m.value, name: m.displayName }));
  } catch {
    return []; // no list → the selector disappears; jobs keep the default model
  } finally {
    await probe.interrupt().catch(() => undefined);
  }
}
