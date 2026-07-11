import { query } from '@anthropic-ai/claude-agent-sdk';
import type { ModelOption, SkillOption } from '@eregion/protocol';

export interface Catalog {
  models: ModelOption[];
  skills: SkillOption[];
}

/**
 * Discovers the models and skills allowed by the dev's account by asking Claude
 * Code itself (Query.supportedModels / Query.supportedCommands) — the lists are
 * never hardcoded and reflect the active plan/managed settings. The probe uses a
 * prompt that never produces a message: the control channel replies before the
 * first turn, at zero cost.
 */
export async function discoverCatalog(cwd: string): Promise<Catalog> {
  const never = (async function* () {
    await new Promise<never>(() => undefined);
  })();
  const probe = query({ prompt: never, options: { cwd, maxTurns: 1 } });
  try {
    const [models, commands] = await Promise.all([
      probe.supportedModels().catch(() => []),
      probe.supportedCommands().catch(() => []),
    ]);
    return {
      models: models.map((m) => ({ id: m.value, name: m.displayName })),
      skills: commands.map((c) => ({
        id: c.name,
        name: c.name,
        description: c.description,
        ...(c.argumentHint ? { argumentHint: c.argumentHint } : {}),
      })),
    };
  } catch {
    return { models: [], skills: [] }; // no lists → selectors disappear; jobs keep the defaults
  } finally {
    await probe.interrupt().catch(() => undefined);
  }
}
