export const PKG = '@eregion/chat-ui' as const;

export { mountChat, CHAT_TAG } from './mount.js';
export { JobStore, type Job, type JobEvent, type JobStatus, type UiState, type PendingPermission } from './store.js';
