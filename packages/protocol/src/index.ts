// @eregion/protocol — Zod contract between overlay (browser), daemon, and chat-ui.
export const PKG = '@eregion/protocol' as const;

export {
  PROTOCOL_VERSION,
  SourceRef,
  HttpActivity,
  SelectedComponent,
  SelectionPayload,
  AreaSelection,
  PageComponent,
} from './selection-payload.js';
export {
  ClientMessage,
  DaemonMessage,
  ChatUsage,
  Envelope,
  parseClientMessage,
  parseDaemonMessage,
  makeEnvelope,
  type ParseResult,
  ModelOption,
  SkillOption,
  ChatImage,
} from './messages.js';
export { TAG_ATTR, formatTagValue, parseTagValue } from './source-tag.js';
export { BackendTrace, DbQuery } from './trace.js';
export { AngularIndex, AngularComponentEntry } from './angular-index.js';
