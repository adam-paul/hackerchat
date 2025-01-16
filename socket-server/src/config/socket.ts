// socket-server/src/config/socket.ts

import type { ServerOptions } from 'socket.io';
import { ENV } from './environment';
import { EVENTS, type SocketEvents } from '../types/events';

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

export { EVENTS, type SocketEvents };

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