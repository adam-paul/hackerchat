// src/lib/socket/events.ts

// Connection event constants
export const EVENTS = {
  // Connection events
  CONNECT: 'connect' as const,
  DISCONNECT: 'disconnect' as const,
  ERROR: 'error' as const,
  
  // Channel events
  JOIN_CHANNEL: 'join-channel' as const,
  LEAVE_CHANNEL: 'leave-channel' as const,
  CHANNEL_JOINED: 'channel-joined' as const,
  CHANNEL_LEFT: 'channel-left' as const,
  CREATE_CHANNEL: 'create-channel' as const,
  CHANNEL_CREATED: 'channel-created' as const,
  DELETE_CHANNEL: 'delete-channel' as const,
  CHANNEL_DELETED: 'channel-deleted' as const,
  UPDATE_CHANNEL: 'update-channel' as const,
  CHANNEL_UPDATED: 'channel-updated' as const,
  
  // Message events
  MESSAGE: 'message' as const,
  MESSAGE_DELIVERED: 'message-delivered' as const,
  MESSAGE_ERROR: 'message-error' as const,
  MESSAGE_DELETED: 'message-deleted' as const,
  MESSAGE_UPDATED: 'message-updated' as const,
  
  // Status events
  STATUS_UPDATE: 'status-update' as const,
  STATUS_CHANGED: 'status-changed' as const,
  
  // Reaction events
  ADD_REACTION: 'add-reaction' as const,
  REMOVE_REACTION: 'remove-reaction' as const,
  REACTION_ADDED: 'reaction-added' as const,
  REACTION_REMOVED: 'reaction-removed' as const,
  
  // Typing events
  TYPING_START: 'typing-start' as const,
  TYPING_STOP: 'typing-stop' as const
} as const;

export type SocketEvents = typeof EVENTS[keyof typeof EVENTS]; 