import { describe, expect, it } from 'vitest';
import { AgentRuntime, type PlanItem, type RuntimeEvents } from './agent-runtime.js';

type ToolCall = { name: string; label: string; status: 'running' | 'done' };

function makeRuntime() {
  const tools: ToolCall[] = [];
  const plans: PlanItem[][] = [];
  const events: RuntimeEvents = {
    onSessionInit: () => undefined,
    onDelta: () => undefined,
    onToolUse: (name, label, status) => tools.push({ name, label, status }),
    onPlan: (items) => plans.push(items),
    onResult: () => undefined,
    onEditApplied: () => undefined,
    onStatus: () => undefined,
    onError: () => undefined,
  };
  const runtime = new AgentRuntime(
    { cwd: '/repo', mcpServer: {} as never, broker: {} as never },
    events,
  );
  // handleMessage is private; drive it directly to avoid spawning a real query.
  const feed = (msg: unknown) => (runtime as unknown as { handleMessage(m: unknown): void }).handleMessage(msg);
  return { runtime, tools, plans, feed };
}

describe('AgentRuntime plan handling', () => {
  it('turns TodoWrite into onPlan and emits no generic tool step', () => {
    const { tools, plans, feed } = makeRuntime();
    feed({
      type: 'assistant',
      parent_tool_use_id: null,
      message: {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 't1',
            name: 'TodoWrite',
            input: {
              todos: [
                { content: 'read the component', status: 'completed' },
                { text: 'apply the change', status: 'in_progress' },
                { content: 'verify', status: 'unknown_status' },
                { status: 'pending' }, // no text → dropped
              ],
            },
          },
        ],
      },
    });
    expect(plans).toEqual([
      [
        { text: 'read the component', status: 'completed' },
        { text: 'apply the change', status: 'in_progress' },
        { text: 'verify', status: 'pending' },
      ],
    ]);
    expect(tools).toEqual([]);
  });
});

describe('AgentRuntime subagent visibility', () => {
  it('counts child tool_use blocks and marks the parent Task done with the final label', () => {
    const { tools, feed } = makeRuntime();
    // parent Task starts
    feed({
      type: 'assistant',
      parent_tool_use_id: null,
      message: { role: 'assistant', content: [{ type: 'tool_use', id: 'task1', name: 'Task', input: {} }] },
    });
    // subagent runs two tools, then one more
    feed({
      type: 'assistant',
      parent_tool_use_id: 'task1',
      message: {
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 'c1', name: 'Grep', input: {} },
          { type: 'tool_use', id: 'c2', name: 'Read', input: {} },
        ],
      },
    });
    feed({
      type: 'assistant',
      parent_tool_use_id: 'task1',
      message: { role: 'assistant', content: [{ type: 'tool_use', id: 'c3', name: 'Read', input: {} }] },
    });
    // Task tool_result closes the step
    feed({
      type: 'user',
      parent_tool_use_id: null,
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'task1' }] },
    });

    expect(tools.every((t) => t.name === 'Task')).toBe(true);
    expect(tools).toEqual([
      { name: 'Task', label: 'exploring with subagent', status: 'running' },
      { name: 'Task', label: 'exploring with subagent (2 steps)', status: 'running' },
      { name: 'Task', label: 'exploring with subagent (3 steps)', status: 'running' },
      { name: 'Task', label: 'exploring with subagent (3 steps)', status: 'done' },
    ]);
  });
});

describe('AgentRuntime image prompts', () => {
  it('builds a text+image content array from attached images', () => {
    const { runtime } = makeRuntime();
    // A truthy handle keeps sendMessage from starting a real query.
    (runtime as unknown as { queryHandle: unknown }).queryHandle = {};
    runtime.sendMessage('what is this?', undefined, [{ mediaType: 'image/png', data: 'aGVsbG8=' }]);
    const inbox = (runtime as unknown as { inbox: Array<{ message: { content: unknown } }> }).inbox;
    expect(inbox[0]!.message.content).toEqual([
      { type: 'text', text: 'what is this?' },
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'aGVsbG8=' } },
    ]);
  });

  it('keeps content as a plain string when there are no images', () => {
    const { runtime } = makeRuntime();
    (runtime as unknown as { queryHandle: unknown }).queryHandle = {};
    runtime.sendMessage('plain text');
    const inbox = (runtime as unknown as { inbox: Array<{ message: { content: unknown } }> }).inbox;
    expect(inbox[0]!.message.content).toBe('plain text');
  });
});
