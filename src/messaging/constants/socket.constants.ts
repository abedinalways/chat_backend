export const WS_EVENTS = {
  SEND_MESSAGE: 'send_message',
  TYPING: 'typing',
  MARK_AS_READ: 'mark_as_read',
  JOIN_CONVERSATION: 'join_conversation',
  LEAVE_CONVERSATION: 'leave_conversation',
} as const;

export const WS_EMIT = {
  NEW_MESSAGE: 'new_message',
  TYPING_UPDATE: 'typing_update',
  MESSAGE_READ: 'message_read',
  USER_CONNECTED: 'user_connected',
  USER_DISCONNECTED: 'user_disconnected',
  NOTIFICATION: 'notification',
  ERROR: 'error',
} as const;

export type WsEvent = (typeof WS_EVENTS)[keyof typeof WS_EVENTS];
export type WsEmit = (typeof WS_EMIT)[keyof typeof WS_EMIT];
