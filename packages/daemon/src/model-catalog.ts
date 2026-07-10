import { query } from '@anthropic-ai/claude-agent-sdk';
import type { ModelOption } from '@eregion/protocol';

/**
 * Descobre os modelos permitidos pela conta do dev perguntando ao próprio
 * Claude Code (Query.supportedModels) — a lista nunca é hardcoded e reflete
 * plano/managed settings vigentes. A sonda usa um prompt que nunca produz
 * mensagem: o canal de controle responde antes do primeiro turn, custo zero.
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
    return []; // sem lista o seletor some; jobs seguem no modelo default
  } finally {
    await probe.interrupt().catch(() => undefined);
  }
}
