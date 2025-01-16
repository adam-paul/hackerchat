// socket-server/src/config/socket.ts

import type { ServerOptions } from 'socket.io';
import { ENV } from './environment';

export const SOCKET_CONFIG: Partial<ServerOptions> = {
  cors: {
    origin: ENV.CLIENT_URL,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  connectionStateRecovery: {
    // Enable connection state recovery
    maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
    skipMiddlewares: true,
  },
  pingTimeout: 60000, // 60 seconds
  pingInterval: 25000, // 25 seconds
  transports: ['websocket'],
  allowEIO3: true, // Enable compatibility with Socket.IO v3 clients
  connectTimeout: 45000, // 45 seconds
  maxHttpBufferSize: 1e6, // 1MB
  path: '/socket.io/', // Default Socket.IO path
  serveClient: false, // Don't serve client files
  
  // Add adapter options if using Redis or other adapters
  // adapter: redisAdapter({ host: 'localhost', port: 6379 }),
};

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

// Rate limiting configuration
export const RATE_LIMITS = {
  messages: {
    points: 10, // Number of messages
    duration: 10, // Per 10 seconds
  },
  joinChannel: {
    points: 5, // Number of joins
    duration: 60, // Per minute
  },
  connection: {
    points: 5, // Number of connection attempts
    duration: 60, // Per minute
  },
} as const;

// Timeout configurations
export const TIMEOUTS = {
  auth: 10000, // 10 seconds for authentication
  message: 5000, // 5 seconds for message delivery confirmation
  typing: 5000, // 5 seconds for typing indicator to expire
} as const; 