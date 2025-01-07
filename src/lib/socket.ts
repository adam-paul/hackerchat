// src/lib/socket.ts

import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import type { Message } from '@/types';
import { clerkClient } from '@clerk/nextjs';

interface ServerToClientEvents {
  message: (data: { type: string; channelId: string; message: Message }) => void;
}

interface ClientToServerEvents {
  'join-channel': (channelId: string) => void;
  'leave-channel': (channelId: string) => void;
}

let io: SocketIOServer<ClientToServerEvents, ServerToClientEvents> | null = null;

export const initSocketServer = (httpServer: HTTPServer) => {
  if (!io) {
    io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(httpServer, {
      path: '/api/socket',
      addTrailingSlash: false,
      transports: ['websocket'],
      cors: {
        origin: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
        methods: ['GET', 'POST'],
        credentials: true
      },
    });

    io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization;
        if (!token) {
          return next(new Error('Authentication token missing'));
        }

        try {
          const session = await clerkClient.sessions.verifySession(token, token);
          if (!session?.userId) {
            return next(new Error('Invalid session'));
          }
          socket.data.userId = session.userId;
          next();
        } catch (error) {
          return next(new Error('Invalid token'));
        }
      } catch (error) {
        next(new Error('Authentication failed'));
      }
    });

    io.on('connection', (socket) => {
      console.log('Client connected:', socket.data.userId);

      socket.on('join-channel', (channelId: string) => {
        socket.join(channelId);
        console.log(`User ${socket.data.userId} joined channel ${channelId}`);
      });

      socket.on('leave-channel', (channelId: string) => {
        socket.leave(channelId);
        console.log(`User ${socket.data.userId} left channel ${channelId}`);
      });

      socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.data.userId);
      });
    });
  }
  return io;
};

export const getIO = () => {
  if (!io) {
    throw new Error('Socket.IO has not been initialized');
  }
  return io;
};

export const emitMessage = (channelId: string, message: Message) => {
  const io = getIO();
  io.to(channelId).emit('message', {
    type: 'message',
    channelId,
    message
  });
};
