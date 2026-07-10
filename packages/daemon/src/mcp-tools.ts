import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import type { BackendTrace, SourceRef } from '@eregion/protocol';
import { z } from 'zod';
import type { InstrumentationCache } from './instrumentation-cache.js';
import type { TraceStore } from './trace-store.js';

export const MCP_SERVER_NAME = 'eregion';

/** Janela de código retornada por get_component_source, em linhas. */
const SOURCE_WINDOW = 120;

function textResult(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}

function readSourceWindow(repoRoot: string, ref: SourceRef): string {
  const abs = path.resolve(repoRoot, ref.file);
  if (!abs.startsWith(repoRoot + path.sep)) {
    return `Recusado: ${ref.file} está fora do workspace.`;
  }
  let content: string;
  try {
    content = readFileSync(abs, 'utf8');
  } catch {
    return `Arquivo não encontrado no disco: ${ref.file}`;
  }
  const lines = content.split('\n');
  const start = Math.max(0, ref.line - 1 - Math.floor(SOURCE_WINDOW / 2));
  const end = Math.min(lines.length, start + SOURCE_WINDOW);
  const numbered = lines
    .slice(start, end)
    .map((l, i) => `${String(start + i + 1).padStart(4)}| ${l}`)
    .join('\n');
  return `${ref.file} (linhas ${start + 1}–${end} de ${lines.length}):\n${numbered}`;
}

function fmtSrc(src?: SourceRef): string {
  return src ? `${src.file}:${src.line}` : 'origem não resolvida';
}

/** Formata um BackendTrace em texto legível para o modelo. */
function formatBackendTrace(trace: BackendTrace): string {
  const lines: string[] = [];
  lines.push(`Rota: ${trace.route ?? '(desconhecida)'}`);
  if (trace.handler) lines.push(`Handler: ${trace.handler.name} (${fmtSrc(trace.handler.src)})`);
  if (trace.durationMs != null) lines.push(`Duração: ${Math.round(trace.durationMs)}ms`);
  lines.push(`traceId: ${trace.traceId}`);
  if (trace.queries.length === 0) {
    lines.push('Queries: nenhuma capturada.');
  } else {
    lines.push(`Queries (${trace.queries.length}):`);
    trace.queries.forEach((q, i) => {
      const ms = q.ms != null ? ` — ${Math.round(q.ms)}ms` : '';
      lines.push(`  ${i + 1}. [${q.db}] ${q.stmt} @ ${fmtSrc(q.src)}${ms}`);
    });
  }
  return lines.join('\n');
}

/**
 * Resolve e formata o BackendTrace para a tool get_backend_trace. Por traceId
 * direto, ou pelo componente selecionado (http[0].traceId). Exportada pura para
 * testar a correlação sem subir o servidor MCP.
 */
export function resolveBackendTrace(
  cache: InstrumentationCache,
  traceStore: TraceStore,
  args: { traceId?: string; selectionId?: string },
): string {
  let id = args.traceId;
  if (!id && args.selectionId) {
    const comp = cache.getComponent(args.selectionId);
    if (!comp) {
      return `Nenhum componente com id "${args.selectionId}" na seleção corrente. Use get_selection primeiro.`;
    }
    id = comp.http?.[0]?.traceId;
    if (!id) {
      return `O componente ${comp.name} não tem request com traceId atribuído (sem rastro de backend).`;
    }
  }
  if (!id) return 'Informe traceId ou selectionId para localizar o trace.';
  const trace = traceStore.get(id);
  if (!trace) {
    return `Nenhum trace de backend para traceId "${id}" (pode ter expirado, ou o backend não está instrumentado com @eregion/node-agent).`;
  }
  return formatBackendTrace(trace);
}

/**
 * As tools de instrumentação viram a via preferencial do modelo (system
 * prompt aponta para cá): 1 tool call barata em vez de Glob/Grep exploratório.
 */
export function createInstrumentationServer(
  cache: InstrumentationCache,
  repoRoot: string,
  traceStore: TraceStore,
) {
  return createSdkMcpServer({
    name: MCP_SERVER_NAME,
    version: '1.0.0',
    tools: [
      tool(
        'get_selection',
        'Retorna os componentes atualmente selecionados pelo desenvolvedor no overlay do app (nome, arquivo:linha, props resumidas, requests). Use SEMPRE que a pergunta mencionar "o componente selecionado", "esse componente", "esses botões" etc.',
        {},
        async () => {
          const sel = cache.getSelection();
          if (!sel || sel.selection.length === 0) {
            return textResult('Nenhum componente selecionado no momento.');
          }
          return textResult(JSON.stringify(sel, null, 2));
        },
      ),
      tool(
        'get_component_source',
        'Retorna o trecho de código-fonte de um componente selecionado (por id da seleção, ex: "s1"). Mais barato e preciso que procurar com Glob/Grep.',
        { id: z.string().describe('id do componente na seleção corrente, ex: "s1"') },
        async ({ id }) => {
          const comp = cache.getComponent(id);
          if (!comp) {
            return textResult(`Nenhum componente com id "${id}" na seleção corrente. Use get_selection primeiro.`);
          }
          const ref = comp.src ?? comp.tpl;
          if (!ref) {
            return textResult(`O componente ${comp.name} não tem origem resolvida (sem src/tpl).`);
          }
          return textResult(readSourceWindow(repoRoot, ref));
        },
      ),
      tool(
        'get_backend_trace',
        'Responde "qual query/handler está por trás desse request/componente": retorna o trace do backend (rota, handler arquivo:linha, e as queries com statement e duração) correlacionado por traceId. Passe traceId direto, ou selectionId (ex: "s1") para resolver o traceId a partir da atividade HTTP do componente selecionado.',
        {
          traceId: z.string().optional().describe('traceId W3C (32 hex) do request'),
          selectionId: z
            .string()
            .optional()
            .describe('id do componente na seleção corrente, ex: "s1"'),
        },
        async (args) => textResult(resolveBackendTrace(cache, traceStore, args)),
      ),
    ],
  });
}
