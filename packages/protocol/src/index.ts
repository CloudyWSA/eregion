// @eregion/protocol — contrato Zod entre overlay (browser), daemon e chat-ui.
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
} from './messages.js';
export { TAG_ATTR, formatTagValue, parseTagValue } from './source-tag.js';
export { BackendTrace, DbQuery } from './trace.js';
export { AngularIndex, AngularComponentEntry } from './angular-index.js';
