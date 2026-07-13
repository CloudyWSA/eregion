import { describe, expect, it } from 'vitest';
import { JobStore, jobSteps, type Job } from './store.js';

const answerOf = (job: Job): string =>
  job.timeline.filter((b) => b.kind === 'text').map((b) => (b as { text: string }).text).join('');

const usage = { inputTokens: 10, outputTokens: 200, cacheReadTokens: 28000, costUsd: 0.02 };

describe('JobStore', () => {
  it('replies share the thread rootId', () => {
    const store = new JobStore();
    const root = store.dispatch('make it blue', ['Header']);
    const turn = store.dispatch('darker please', ['Header'], { rootId: root.rootId });
    expect(root.rootId).toBe(root.jobId);
    expect(turn.rootId).toBe(root.rootId);
    expect(turn.jobId).not.toBe(root.jobId);
  });

  it('dispatch creates a running job; deltas and result close the job', () => {
    const store = new JobStore();
    store.dispatch('make the button green', ['Header']);
    store.handle({ type: 'chat.delta', payload: { text: 'App' } });
    store.handle({ type: 'chat.delta', payload: { text: 'lied.' } });
    store.handle({ type: 'chat.result', payload: { usage, durationMs: 3000 } });

    const [job] = store.getState().jobs;
    expect(job).toMatchObject({ status: 'done', targets: ['Header'], usage });
    expect(answerOf(job!)).toBe('Applied.');
    expect(store.getState().totals).toMatchObject({ jobs: 1, outputTokens: 200, costUsd: 0.02 });
  });

  it('preserves text→tool→text order in the timeline', () => {
    const store = new JobStore();
    store.dispatch('x', ['A']);
    store.handle({ type: 'chat.delta', payload: { text: 'Let me check the file.' } });
    store.handle({ type: 'chat.tool', payload: { name: 'read', label: 'Read src/a.tsx', status: 'running' } });
    store.handle({ type: 'chat.tool', payload: { name: 'read', label: 'Read src/a.tsx', status: 'done' } });
    store.handle({ type: 'chat.delta', payload: { text: 'It exports a Button.' } });

    expect(store.getState().jobs[0]!.timeline).toEqual([
      { kind: 'text', text: 'Let me check the file.' },
      { kind: 'tool', name: 'read', label: 'Read src/a.tsx', status: 'done' },
      { kind: 'text', text: 'It exports a Button.' },
    ]);
  });

  it('interleaved events from PARALLEL jobs do not mix (assigned by jobId)', () => {
    const store = new JobStore();
    const a = store.dispatch('make the Header blue', ['Header']);
    const b = store.dispatch('standardize the cards', ['OrderCard']);

    store.handle({ type: 'chat.delta', payload: { text: 'Editing the Header…', jobId: a.jobId } });
    store.handle({ type: 'chat.delta', payload: { text: 'Adjusting the cards…', jobId: b.jobId } });
    store.handle({ type: 'edit.applied', payload: { file: 'src/OrderCard.tsx', diff: '+x', jobId: b.jobId } });
    store.handle({ type: 'chat.result', payload: { usage, durationMs: 900, jobId: b.jobId } });
    store.handle({ type: 'chat.delta', payload: { text: ' done.', jobId: a.jobId } });
    store.handle({ type: 'chat.result', payload: { usage, durationMs: 2000, jobId: a.jobId } });

    const [jobA, jobB] = store.getState().jobs;
    expect(jobA!.status).toBe('done');
    expect(answerOf(jobA!)).toBe('Editing the Header… done.');
    expect(jobSteps(jobA!)).toEqual([]);
    expect(jobB!.status).toBe('done');
    expect(answerOf(jobB!)).toBe('Adjusting the cards…');
    expect(jobSteps(jobB!)).toMatchObject([{ kind: 'edit', label: 'src/OrderCard.tsx' }]);
    expect(store.getState().totals.jobs).toBe(2);
  });

  it('jobs queue FIFO: events go to the oldest open one', () => {
    const store = new JobStore();
    store.dispatch('first', ['A']);
    store.dispatch('second', ['B']);
    expect(store.getState().jobs.map((j) => j.status)).toEqual(['queued', 'queued']);

    store.handle({ type: 'chat.delta', payload: { text: 'answer for the first' } });
    store.handle({ type: 'chat.result', payload: { usage, durationMs: 100 } });
    store.handle({ type: 'chat.delta', payload: { text: 'answer for the second' } });

    const [a, b] = store.getState().jobs;
    expect(a!.status).toBe('done');
    expect(answerOf(a!)).toBe('answer for the first');
    expect(b!.status).toBe('running');
    expect(answerOf(b!)).toBe('answer for the second');
  });

  it('running tool updates in-place to its final status', () => {
    const store = new JobStore();
    store.dispatch('x', ['A']);
    store.handle({ type: 'chat.tool', payload: { name: 't', label: 'get_selection', status: 'running' } });
    store.handle({ type: 'chat.tool', payload: { name: 't', label: 'get_selection', status: 'done' } });
    expect(jobSteps(store.getState().jobs[0]!)).toEqual([
      { kind: 'tool', name: 't', label: 'get_selection', status: 'done' },
    ]);
  });

  it('edit.applied becomes an event with a checkpoint; error marks the job as failed', () => {
    const store = new JobStore();
    store.dispatch('x', ['A']);
    store.handle({ type: 'edit.applied', payload: { file: 'src/a.tsx', diff: '- a\n+ b', checkpointId: 'c1' } });
    store.handle({ type: 'error', payload: { code: 'rate_limit', message: 'window exhausted' } });
    const job = store.getState().jobs[0]!;
    expect(job.status).toBe('failed');
    expect(jobSteps(job)).toMatchObject([
      { kind: 'edit', label: 'src/a.tsx', checkpointId: 'c1' },
      { kind: 'error', label: 'rate_limit' },
    ]);
  });

  it('discovered models arrive via models.update and the choice travels on the job', () => {
    const store = new JobStore();
    store.handle({ type: 'models.update', payload: { models: [
      { id: 'default', name: 'Default (recommended)' },
      { id: 'sonnet', name: 'Sonnet' },
    ] } });
    expect(store.getState().models).toHaveLength(2);

    // default: job with no model override
    const withoutModel = store.dispatch('x', ['A']);
    expect(withoutModel.model).toBeUndefined();

    store.setSelectedModel('sonnet');
    const withModel = store.dispatch('y', ['B']);
    expect(withModel).toMatchObject({ model: 'sonnet', modelName: 'Sonnet' });
  });

  it('auto-approve defaults off and toggles', () => {
    const store = new JobStore();
    expect(store.getState().autoApprove).toBe(false);
    store.setAutoApprove(true);
    expect(store.getState().autoApprove).toBe(true);
    store.setAutoApprove(false);
    expect(store.getState().autoApprove).toBe(false);
  });

  it('permission.request exposes the pending item and permissionResolved clears it', () => {
    const store = new JobStore();
    store.handle({ type: 'permission.request', payload: { requestId: 'p1', toolName: 'Bash', summary: 'git push' } });
    expect(store.getState().permission?.requestId).toBe('p1');
    store.permissionResolved();
    expect(store.getState().permission).toBeNull();
  });
});
