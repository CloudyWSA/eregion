export const PKG = '@eregion/chat-ui' as const;

export { mountChat, CHAT_TAG } from './mount.js';
export {
  JobStore,
  jobSteps,
  type Job,
  type JobEvent,
  type TimelineBlock,
  type TextBlock,
  type JobStatus,
  type UiState,
  type PendingPermission,
} from './store.js';
