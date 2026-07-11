import { h, render, Fragment } from 'preact';
import { areaAnchor, onErrors, clearErrors, type CapturedError, type EngineState, type EregionDevtoolsElement } from '@eregion/overlay';
import type { AnchorTarget } from './ui/anchored.js';
import type { ChatImage } from '@eregion/protocol';
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

  let consoleErrors: CapturedError[] = [];

  let pinned: { name: string; ref: string } | null = null;
  const setPinned = (value: { name: string; ref: string } | null): void => {
    pinned = value;
    rerender();
  };

  overlay.engine.onExplain = (hit) => {
    const where = hit.tpl ?? hit.src;
    dispatch(
      `Explain this component to me: what it renders, where its data comes from (use get_backend_trace when it has requests) and where it lives in the code${where ? ` (${where.file}:${where.line})` : ''}. Do not edit anything.`,
    );
  };

  const anchors = new Map<string, JobAnchor>();
  const cornerAnchor = (): AnchorTarget => ({
    isConnected: true,
    getBoundingClientRect: () => new DOMRect(24, window.innerHeight - 260, 0, 0),
  });

  const offsetAnchor = (base: AnchorTarget, i: number): AnchorTarget =>
    i === 0
      ? base
      : {
          isConnected: true,
          getBoundingClientRect: () => {
            const r = base.getBoundingClientRect();
            return new DOMRect(r.x + i * 28, r.y + i * 28, r.width, r.height);
          },
        };

  const dispatch = (prompt: string, variants = 1, images: ChatImage[] = []): void => {
    const { selected, area } = overlay.engine.getState();
    const withPin = pinned ? `${prompt}\n<style reference: ${pinned.name} — ${pinned.ref}>` : prompt;
    const anchor: AnchorTarget | undefined = area
      ? areaAnchor(area)
      : selected[selected.length - 1]?.element;
    const targets = [
      ...(area ? [area.container ? `area in ${area.container.name}` : 'free area'] : []),
      ...selected.map((s) => s.name),
    ];
    for (let i = 0; i < Math.max(1, variants); i += 1) {
      const text =
        variants > 1
          ? `${withPin}\n(Variant ${i + 1} of ${variants} — take a distinct approach from the other variants.)`
          : withPin;
      const job = store.dispatch(variants > 1 ? `${prompt} (v${i + 1})` : prompt, targets.length > 0 ? targets : ['app']);
      if (anchor) anchors.set(job.rootId, { anchor: offsetAnchor(anchor, i), open: true });
      client?.send({
        type: 'chat.send',
        payload: {
          text,
          attachSelection: true,
          jobId: job.jobId,
          ...(job.model ? { model: job.model } : {}),
          ...(images.length > 0 ? { images } : {}),
        },
      });
    }
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
    } else if (open) {
      // rehydrated job without a live anchor: pin it near the viewport corner
      anchors.set(jobId, { anchor: cornerAnchor(), open: true });
    }
    rerender();
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
      const last = thread[thread.length - 1]!;
      if (!entry) {
        // rehydrated after refresh: the DOM anchor is gone, keep it reachable
        if (ui.jobs.indexOf(last) >= ui.jobs.length - 6) trayJobs.push(thread[0]!);
        continue;
      }
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
          skills: ui.skills,
          selectedModel: ui.selectedModel,
          pinned,
          onPin: setPinned,
          pageComponents: () => overlay.engine.pageComponents(),
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
        h(JobTray, {
          key: 'tray',
          jobs: trayJobs,
          errors: consoleErrors,
          onOpen: (id: string) => setOpen(id, true),
          onFixErrors: () => {
            const list = consoleErrors
              .map((e) => `- ${e.message}${e.stack ? `\n${e.stack}` : ''}`)
              .join('\n');
            clearErrors();
            dispatch(`Fix these console errors from the running app:\n${list}`);
          },
        }),
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
  onErrors((errors) => {
    consoleErrors = errors;
    rerender();
  });

  return host;
}
