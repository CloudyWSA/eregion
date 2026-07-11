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
    if (anchor) anchors.set(job.jobId, { anchor, open: true });
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
    const anchored: Array<{ job: Job; anchor: AnchorTarget }> = [];
    const trayJobs: Job[] = [];
    for (const job of ui.jobs) {
      const entry = anchors.get(job.jobId);
      if (!entry) continue;
      if (entry.open) anchored.push({ job, anchor: entry.anchor });
      else if (job.status === 'queued' || job.status === 'running') trayJobs.push(job);
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
        ...anchored.map(({ job, anchor }) =>
          h(JobPopover, {
            key: job.jobId,
            job,
            anchor,
            onClose: () => setOpen(job.jobId, false),
            onRevert,
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
