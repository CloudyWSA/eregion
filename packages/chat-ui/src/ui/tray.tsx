import type { Job, PendingPermission } from '../store.js';

/** Jobs em andamento cujo popover foi fechado — uma pill para reabrir. */
export function JobTray({ jobs, onOpen }: { jobs: Job[]; onOpen(jobId: string): void }) {
  if (jobs.length === 0) return null;
  return (
    <div class="eg-tray">
      {jobs.map((job) => (
        <button key={job.jobId} class="eg-tray-pill" onClick={() => onOpen(job.jobId)}>
          <span class={`eg-dot ${job.status}`} />
          <span class="eg-tray-prompt">{job.prompt}</span>
        </button>
      ))}
    </div>
  );
}

interface ModalProps {
  permission: PendingPermission | null;
  onRespond(requestId: string, allow: boolean): void;
}

export function ApprovalModal({ permission, onRespond }: ModalProps) {
  if (!permission) return null;
  return (
    <div class="eg-scrim">
      <div class="eg-modal">
        <div class="eg-modal-title">
          Permitir <b>{permission.toolName}</b>?
        </div>
        <div class="eg-modal-cmd">{permission.summary}</div>
        {permission.diff && <div class="eg-modal-diff">{permission.diff}</div>}
        <div class="eg-modal-actions">
          <button class="eg-act-deny" onClick={() => onRespond(permission.requestId, false)}>Negar</button>
          <button class="eg-act-allow" onClick={() => onRespond(permission.requestId, true)}>Permitir</button>
        </div>
      </div>
    </div>
  );
}
