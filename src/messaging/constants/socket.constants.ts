// ──────────────────────────────────────────────────────────
// Socket event constants
// These names MUST match the frontend types/chat.ts definitions.
// If you rename an event here, update the frontend too!
// ──────────────────────────────────────────────────────────

/** Events the server LISTENS for (client → server). */
export const WS_EVENTS = {
  SEND_MESSAGE: 'sendMessage',
  TYPING: 'typing',
  MARK_AS_READ: 'markRead',
  JOIN_CONVERSATION: 'joinRoom',
  LEAVE_CONVERSATION: 'leaveRoom',
} as const;

/** Events the server EMITS (server → client). */
export const WS_EMIT = {
  NEW_MESSAGE: 'newMessage',
  TYPING_UPDATE: 'typing',
  MESSAGE_READ: 'messageRead',
  USER_CONNECTED: 'userConnected',
  USER_DISCONNECTED: 'userDisconnected',
  NOTIFICATION: 'notification',
  ERROR: 'error',
  USER_STATUS: 'userStatus',
} as const;

export type WsEvent = (typeof WS_EVENTS)[keyof typeof WS_EVENTS];
export type WsEmit = (typeof WS_EMIT)[keyof typeof WS_EMIT];
