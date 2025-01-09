// socket-server/src/index.ts

import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables from local .env file
config({ 
  path: resolve(__dirname, '../.env'),
  override: true // This will make .env take precedence over system env vars
});

import { createServer } from 'http';
import { Server } from 'socket.io';
import { authMiddleware } from './middleware/auth';
import { handleConnection } from './handlers';
import { SOCKET_TIMEOUT, PING_INTERVAL, PING_TIMEOUT } from './config/constants';

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true
  },
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
  },
  pingInterval: PING_INTERVAL,
  pingTimeout: PING_TIMEOUT,
  connectTimeout: SOCKET_TIMEOUT
});

// Apply authentication middleware
io.use(authMiddleware);

// Handle socket connections
io.on('connection', handleConnection);

// Start server
const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
  console.log(`Socket.IO server running on port ${PORT}`);
}); 