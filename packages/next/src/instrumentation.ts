// registerEregionInstrumentation — para o `instrumentation.ts` do Next: liga
// o agente OTel de backend (`@eregion/node-agent`) só no runtime Node (não
// no edge) e só em dev.
//
// `@eregion/node-agent` NÃO é dependency deste pacote — é peer opcional
// (instrumentação de backend é um recurso à parte do tagging/overlay). O
// import é dinâmico via especificador em variável (não string literal) de
// propósito: assim o TypeScript não tenta resolver o módulo em tempo de
// typecheck, já que ele pode legitimamente não estar instalado no app do
// dev. Falhas de import (pacote ausente) são silenciosas.
export async function registerEregionInstrumentation(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.NODE_ENV === 'production') return;

  const specifier = '@eregion/node-agent';
  try {
    const nodeAgent = (await import(specifier)) as { init?: () => void };
    nodeAgent.init?.();
  } catch {
    // @eregion/node-agent não instalado — instrumentação de backend é opcional.
  }
}
