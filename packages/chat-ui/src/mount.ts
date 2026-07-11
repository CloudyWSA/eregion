import { h, render, Fragment } from 'preact';
import { areaAnchor, type EngineState, type EregionDevtoolsElement } from '@eregion/overlay';
import type { AnchorTarget } from './ui/anchored.js';
import { JobStore, type Job } from './store.js';
import { JobPopover } from './ui/job-popover.js';
import { PromptPopover } from './ui/prompt-popover.js';
import { ApprovalModal, JobTray } from './ui/tray.js';
import { CHAT_CSS } from './ui/styles.js';

export const CHAT_TAG = 'eregion-chat';

interface JobAnchor {
  anchor: AnchorTarget;
  open: boolean;
}

export function mountChat(overlay: EregionDevtoolsElement): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  const existing = document.querySelector(CHAT_TAG);
  if (existing) return existing as HTMLElement;

  if (!customElements.get(CHAT_TAG)) {
    customElements.define(CHAT_TAG, class extends HTMLElement {});
  }
  const host = document.createElement(CHAT_TAG);
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = CHAT_CSS;
  shadow.appendChild(style);

  const store = new JobStore();
  const client = overlay.client;
  client?.onMessage((msg) => store.handle(msg));

  const anchors = new Map<string, JobAnchor>();

  const dispatch = (prompt: string): void => {
    const { selected, area } = overlay.engine.getState();
    const anchor: AnchorTarget | undefined = area
      ? areaAnchor(area)
      : selected[selected.length - 1]?.element;
    const targets = [
      ...(area ? [area.container ? `area in ${area.container.name}` : 'free area'] : []),
      ...selected.map((s) => s.name),
    ];
    const job = store.dispatch(prompt, targets.length > 0 ? targets : ['app']);
    if (anchor) anchors.set(job.rootId, { anchor, open: true });
    client?.send({
      type: 'chat.send',
      payload: {
        text: prompt,
        attachSelection: true,
        jobId: job.jobId,
        ...(job.model ? { model: job.model } : {}),
      },
    });
    overlay.engine.clear();
    rerender();
  };

  const reply = (thread: Job[], text: string): void => {
    const lastTurn = thread[thread.length - 1]!;
    const turn = store.dispatch(text, lastTurn.targets, { rootId: lastTurn.rootId });
    client?.send({
      type: 'chat.send',
      payload: { text, attachSelection: false, jobId: turn.jobId, replyTo: lastTurn.jobId },
    });
  };

  const setOpen = (jobId: string, open: boolean): void => {
    const entry = anchors.get(jobId);
    if (entry) {
      entry.open = open;
      rerender();
    }
  };

  const onRevert = (checkpointId: string): void => {
    client?.send({ type: 'changes.revert', payload: { checkpointId } });
  };

  const rerender = (ui = store.getState(), engine: EngineState = overlay.engine.getState()) => {
    const threads = new Map<string, Job[]>();
    for (const job of ui.jobs) {
      const list = threads.get(job.rootId);
      if (list) list.push(job);
      else threads.set(job.rootId, [job]);
    }
    const anchored: Array<{ thread: Job[]; anchor: AnchorTarget }> = [];
    const trayJobs: Job[] = [];
    for (const [rootId, thread] of threads) {
      const entry = anchors.get(rootId);
      if (!entry) continue;
      const last = thread[thread.length - 1]!;
      if (entry.open) anchored.push({ thread, anchor: entry.anchor });
      else if (last.status === 'queued' || last.status === 'running') trayJobs.push(thread[0]!);
    }

    render(
      h(Fragment, null, [
        h(PromptPopover, {
          key: 'ask',
          selected: engine.selected,
          area: engine.area,
          models: ui.models,
          selectedModel: ui.selectedModel,
          onModelChange: (id: string) => store.setSelectedModel(id),
          onDispatch: dispatch,
        }),
        ...anchored.map(({ thread, anchor }) =>
          h(JobPopover, {
            key: thread[0]!.rootId,
            thread,
            anchor,
            onClose: () => setOpen(thread[0]!.rootId, false),
            onRevert,
            onReply: (text: string) => reply(thread, text),
          }),
        ),
        h(JobTray, { key: 'tray', jobs: trayJobs, onOpen: (id: string) => setOpen(id, true) }),
        h(ApprovalModal, {
          key: 'modal',
          permission: ui.permission,
          onRespond: (requestId: string, allow: boolean) => {
            client?.send({ type: 'permission.respond', payload: { requestId, allow } });
            store.permissionResolved();
          },
        }),
      ]),
      shadow,
    );
  };
  store.subscribe((ui) => rerender(ui, overlay.engine.getState()));
  overlay.engine.subscribe((engine) => rerender(store.getState(), engine));

  return host;
}
