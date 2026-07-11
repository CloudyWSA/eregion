import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import type { BackendTrace, SourceRef } from '@eregion/protocol';
import { z } from 'zod';
import type { InstrumentationCache } from './instrumentation-cache.js';
import type { TraceStore } from './trace-store.js';

export const MCP_SERVER_NAME = 'eregion';

/** Source window returned by get_component_source, in lines. */
const SOURCE_WINDOW = 120;

function textResult(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}

function readSourceWindow(repoRoot: string, ref: SourceRef): string {
  const abs = path.resolve(repoRoot, ref.file);
  if (!abs.startsWith(repoRoot + path.sep)) {
    return `Refused: ${ref.file} is outside the workspace.`;
  }
  let content: string;
  try {
    content = readFileSync(abs, 'utf8');
  } catch {
    return `File not found on disk: ${ref.file}`;
  }
  const lines = content.split('\n');
  const start = Math.max(0, ref.line - 1 - Math.floor(SOURCE_WINDOW / 2));
  const end = Math.min(lines.length, start + SOURCE_WINDOW);
  const numbered = lines
    .slice(start, end)
    .map((l, i) => `${String(start + i + 1).padStart(4)}| ${l}`)
    .join('\n');
  return `${ref.file} (lines ${start + 1}–${end} of ${lines.length}):\n${numbered}`;
}

function fmtSrc(src?: SourceRef): string {
  return src ? `${src.file}:${src.line}` : 'source not resolved';
}

function formatBackendTrace(trace: BackendTrace): string {
  const lines: string[] = [];
  lines.push(`Route: ${trace.route ?? '(unknown)'}`);
  if (trace.handler) lines.push(`Handler: ${trace.handler.name} (${fmtSrc(trace.handler.src)})`);
  if (trace.durationMs != null) lines.push(`Duration: ${Math.round(trace.durationMs)}ms`);
  lines.push(`traceId: ${trace.traceId}`);
  if (trace.queries.length === 0) {
    lines.push('Queries: none captured.');
  } else {
    lines.push(`Queries (${trace.queries.length}):`);
    trace.queries.forEach((q, i) => {
      const ms = q.ms != null ? ` — ${Math.round(q.ms)}ms` : '';
      lines.push(`  ${i + 1}. [${q.db}] ${q.stmt} @ ${fmtSrc(q.src)}${ms}`);
    });
  }
  return lines.join('\n');
}

/** Exported pure so the correlation can be tested without a live MCP server. */
export function resolveBackendTrace(
  cache: InstrumentationCache,
  traceStore: TraceStore,
  args: { traceId?: string; selectionId?: string },
): string {
  let id = args.traceId;
  if (!id && args.selectionId) {
    const comp = cache.getComponent(args.selectionId);
    if (!comp) {
      return `No component with id "${args.selectionId}" in the current selection. Use get_selection first.`;
    }
    id = comp.http?.[0]?.traceId;
    if (!id) {
      return `Component ${comp.name} has no request with an assigned traceId (no backend trace).`;
    }
  }
  if (!id) return 'Provide traceId or selectionId to locate the trace.';
  const trace = traceStore.get(id);
  if (!trace) {
    return `No backend trace for traceId "${id}" (it may have expired, or the backend is not instrumented with @eregion/node-agent).`;
  }
  return formatBackendTrace(trace);
}

/**
 * The instrumentation tools are the model's preferred path (the system prompt
 * points here): one cheap tool call instead of exploratory Glob/Grep.
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
        'Returns the components currently selected by the developer in the app overlay (name, file:line, summarized props, requests). ALWAYS use it when the question mentions "the selected component", "this component", "these buttons", etc.',
        {},
        async () => {
          const sel = cache.getSelection();
          if (!sel || sel.selection.length === 0) {
            return textResult('No component selected right now.');
          }
          return textResult(JSON.stringify(sel, null, 2));
        },
      ),
      tool(
        'get_component_source',
        'Returns the source-code snippet of a selected component (by selection id, e.g. "s1"). Cheaper and more precise than searching with Glob/Grep.',
        { id: z.string().describe('id of the component in the current selection, e.g. "s1"') },
        async ({ id }) => {
          const comp = cache.getComponent(id);
          if (!comp) {
            return textResult(`No component with id "${id}" in the current selection. Use get_selection first.`);
          }
          const ref = comp.src ?? comp.tpl;
          if (!ref) {
            return textResult(`Component ${comp.name} has no resolved source (no src/tpl).`);
          }
          return textResult(readSourceWindow(repoRoot, ref));
        },
      ),
      tool(
        'get_backend_trace',
        'Answers "which query/handler is behind this request/component": returns the backend trace (route, handler file:line, and the queries with statement and duration) correlated by traceId. Pass traceId directly, or selectionId (e.g. "s1") to resolve the traceId from the selected component\'s HTTP activity.',
        {
          traceId: z.string().optional().describe('W3C traceId (32 hex) of the request'),
          selectionId: z
            .string()
            .optional()
            .describe('id of the component in the current selection, e.g. "s1"'),
        },
        async (args) => textResult(resolveBackendTrace(cache, traceStore, args)),
      ),
    ],
  });
}
