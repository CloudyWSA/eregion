import { describe, expect, it } from 'vitest';
import { JobStore } from './store.js';

const usage = { inputTokens: 10, outputTokens: 200, cacheReadTokens: 28000, costUsd: 0.02 };

describe('JobStore', () => {
  it('dispatch cria job running; deltas e result fecham o job', () => {
    const store = new JobStore();
    store.dispatch('deixa o botão verde', ['Header']);
    store.handle({ type: 'chat.delta', payload: { text: 'Apli' } });
    store.handle({ type: 'chat.delta', payload: { text: 'cado.' } });
    store.handle({ type: 'chat.result', payload: { usage, durationMs: 3000 } });

    const [job] = store.getState().jobs;
    expect(job).toMatchObject({ status: 'done', answer: 'Aplicado.', targets: ['Header'], usage });
    expect(store.getState().totals).toMatchObject({ jobs: 1, outputTokens: 200, costUsd: 0.02 });
  });

  it('eventos intercalados de jobs PARALELOS não se misturam (atribuição por jobId)', () => {
    const store = new JobStore();
    const a = store.dispatch('deixa o Header azul', ['Header']);
    const b = store.dispatch('padroniza os cards', ['OrderCard']);

    store.handle({ type: 'chat.delta', payload: { text: 'Editando o Header…', jobId: a.jobId } });
    store.handle({ type: 'chat.delta', payload: { text: 'Ajustando os cards…', jobId: b.jobId } });
    store.handle({ type: 'edit.applied', payload: { file: 'src/OrderCard.tsx', diff: '+x', jobId: b.jobId } });
    store.handle({ type: 'chat.result', payload: { usage, durationMs: 900, jobId: b.jobId } });
    store.handle({ type: 'chat.delta', payload: { text: ' pronto.', jobId: a.jobId } });
    store.handle({ type: 'chat.result', payload: { usage, durationMs: 2000, jobId: a.jobId } });

    const [jobA, jobB] = store.getState().jobs;
    expect(jobA).toMatchObject({ status: 'done', answer: 'Editando o Header… pronto.', events: [] });
    expect(jobB).toMatchObject({ status: 'done', answer: 'Ajustando os cards…' });
    expect(jobB!.events).toMatchObject([{ kind: 'edit', label: 'src/OrderCard.tsx' }]);
    expect(store.getState().totals.jobs).toBe(2);
  });

  it('jobs enfileiram em FIFO: eventos vão para o mais antigo aberto', () => {
    const store = new JobStore();
    store.dispatch('primeiro', ['A']);
    store.dispatch('segundo', ['B']);
    expect(store.getState().jobs.map((j) => j.status)).toEqual(['queued', 'queued']);

    store.handle({ type: 'chat.delta', payload: { text: 'resposta do primeiro' } });
    store.handle({ type: 'chat.result', payload: { usage, durationMs: 100 } });
    store.handle({ type: 'chat.delta', payload: { text: 'resposta do segundo' } });

    const [a, b] = store.getState().jobs;
    expect(a).toMatchObject({ status: 'done', answer: 'resposta do primeiro' });
    expect(b).toMatchObject({ status: 'running', answer: 'resposta do segundo' });
  });

  it('tool running atualiza in-place no status final', () => {
    const store = new JobStore();
    store.dispatch('x', ['A']);
    store.handle({ type: 'chat.tool', payload: { name: 't', label: 'get_selection', status: 'running' } });
    store.handle({ type: 'chat.tool', payload: { name: 't', label: 'get_selection', status: 'done' } });
    expect(store.getState().jobs[0]!.events).toEqual([{ kind: 'tool', label: 'get_selection', status: 'done' }]);
  });

  it('edit.applied vira evento com checkpoint; erro marca o job como failed', () => {
    const store = new JobStore();
    store.dispatch('x', ['A']);
    store.handle({ type: 'edit.applied', payload: { file: 'src/a.tsx', diff: '- a\n+ b', checkpointId: 'c1' } });
    store.handle({ type: 'error', payload: { code: 'rate_limit', message: 'janela esgotada' } });
    const job = store.getState().jobs[0]!;
    expect(job.status).toBe('failed');
    expect(job.events).toMatchObject([
      { kind: 'edit', label: 'src/a.tsx', checkpointId: 'c1' },
      { kind: 'error', label: 'rate_limit' },
    ]);
  });

  it('modelos descobertos chegam por models.update e a escolha viaja no job', () => {
    const store = new JobStore();
    store.handle({ type: 'models.update', payload: { models: [
      { id: 'default', name: 'Default (recommended)' },
      { id: 'sonnet', name: 'Sonnet' },
    ] } });
    expect(store.getState().models).toHaveLength(2);

    // default: job sem override de modelo
    const semModelo = store.dispatch('x', ['A']);
    expect(semModelo.model).toBeUndefined();

    store.setSelectedModel('sonnet');
    const comModelo = store.dispatch('y', ['B']);
    expect(comModelo).toMatchObject({ model: 'sonnet', modelName: 'Sonnet' });
  });

  it('permission.request expõe pendência e permissionResolved limpa', () => {
    const store = new JobStore();
    store.handle({ type: 'permission.request', payload: { requestId: 'p1', toolName: 'Bash', summary: 'git push' } });
    expect(store.getState().permission?.requestId).toBe('p1');
    store.permissionResolved();
    expect(store.getState().permission).toBeNull();
  });
});
