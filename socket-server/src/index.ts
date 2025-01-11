// socket-server/src/index.ts

import { config } from 'dotenv';
import { resolve } from 'path';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { authMiddleware } from './middleware/auth';
import { handleConnection } from './handlers';
import { SOCKET_CONFIG } from './config/socket';
import broadcastRouter from './routes/broadcast';

// Load environment variables
config({ 
  path: resolve(__dirname, '../.env'),
  override: true
});

const app = express();
const httpServer = createServer(app);
export const io = new Server(httpServer, SOCKET_CONFIG);

// Enable JSON parsing for REST endpoints
app.use(express.json());

// Add broadcast routes
app.use('/api', broadcastRouter);

// Apply authentication middleware
io.use(authMiddleware);

// Handle socket connections
io.on('connection', handleConnection);

// Start server
const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
  console.log(`Socket.IO server running on port ${PORT}`);
});

// For testing/debugging
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
