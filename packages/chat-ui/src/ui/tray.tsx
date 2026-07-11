import type { CapturedError } from '@eregion/overlay';
import type { Job, PendingPermission } from '../store.js';

interface TrayProps {
  jobs: Job[];
  errors: CapturedError[];
  onOpen(jobId: string): void;
  onFixErrors(): void;
}

export function JobTray({ jobs, errors, onOpen, onFixErrors }: TrayProps) {
  if (jobs.length === 0 && errors.length === 0) return null;
  return (
    <div class="eg-tray">
      {errors.length > 0 && (
        <button class="eg-tray-pill eg-tray-errors" onClick={onFixErrors} title={errors[errors.length - 1]!.message}>
          <span class="eg-dot failed" />
          <span class="eg-tray-prompt">
            {errors.length} console {errors.length === 1 ? 'error' : 'errors'} — fix
          </span>
        </button>
      )}
      {jobs.map((job) => (
        <button key={job.rootId} class="eg-tray-pill" onClick={() => onOpen(job.rootId)}>
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
          Allow <b>{permission.toolName}</b>?
        </div>
        <div class="eg-modal-cmd">{permission.summary}</div>
        {permission.diff && <div class="eg-modal-diff">{permission.diff}</div>}
        <div class="eg-modal-actions">
          <button class="eg-act-deny" onClick={() => onRespond(permission.requestId, false)}>Deny</button>
          <button class="eg-act-allow" onClick={() => onRespond(permission.requestId, true)}>Allow</button>
        </div>
      </div>
    </div>
  );
}
