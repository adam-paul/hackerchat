// socket-server/src/handlers/index.ts

import type { SocketType } from '../types/handlers';
import type { MessageEvent, ReactionEvent } from '../types';
import { handleJoinChannel, handleLeaveChannel, handleTyping } from './channel';
import { handleMessage, handleMessageReceived, handleMessageDelete } from './message';
import { handleStatusUpdate } from './status';
import { handleAddReaction, handleRemoveReaction } from './reaction';
import { EVENTS } from '../config/socket';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Track connected users
const connectedUsers = new Set<string>();

// Clean up any stale connections on server restart
process.on('SIGTERM', () => {
  connectedUsers.clear();
});

export const handleConnection = (socket: SocketType): void => {
  const userId = socket.data.userId;
  
  // Clean up any existing entries for this user (handle reconnects)
  connectedUsers.delete(userId);
  
  // Add user to connected users
  connectedUsers.add(userId);

  // Send currently connected users to the new client
  socket.emit('connected-users', Array.from(connectedUsers));

  // Broadcast user connected event to all clients except the sender
  socket.broadcast.emit('user-connected', userId);

  // Channel events
  socket.on(EVENTS.JOIN_CHANNEL, async (channelId: string) => {
    await handleJoinChannel(socket, channelId);
  });

  socket.on(EVENTS.LEAVE_CHANNEL, async (channelId: string) => {
    await handleLeaveChannel(socket, channelId);
  });

  // Message events
  socket.on(EVENTS.MESSAGE, async (data: MessageEvent) => {
    await handleMessage(socket, {
      content: data.message.content,
      channelId: data.channelId,
      fileUrl: data.message.fileUrl,
      fileName: data.message.fileName,
      fileType: data.message.fileType,
      fileSize: data.message.fileSize,
      messageId: data.messageId,
      replyToId: data.message.replyToId
    });
  });

  socket.on(EVENTS.MESSAGE_RECEIVED, async (messageId: string) => {
    await handleMessageReceived(socket, messageId);
  });

  socket.on(EVENTS.MESSAGE_DELETED, async (messageId: string) => {
    await handleMessageDelete(socket, messageId);
  });

  // Reaction events
  socket.on(EVENTS.ADD_REACTION, async (data: ReactionEvent) => {
    await handleAddReaction(socket, data);
  });

  socket.on(EVENTS.REMOVE_REACTION, async (data: ReactionEvent) => {
    await handleRemoveReaction(socket, data);
  });

  // Status events with acknowledgment
  socket.on('status-update', async (status: 'online' | 'away' | 'busy' | 'offline', callback?: (response: { success: boolean; error?: string }) => void) => {
    await handleStatusUpdate(socket, status, callback);
  });

  // Typing events
  socket.on(EVENTS.TYPING_START, async (channelId: string) => {
    await handleTyping(socket, { channelId, isTyping: true });
  });

  socket.on(EVENTS.TYPING_STOP, async (channelId: string) => {
    await handleTyping(socket, { channelId, isTyping: false });
  });

  // Disconnect event
  socket.on('disconnect', async () => {
    // Remove user from connected users
    connectedUsers.delete(userId);

    try {
      // Update user status to offline in database
      await prisma.user.update({
        where: { id: userId },
        data: { status: 'offline' }
      });

      // Broadcast user disconnected and status change events
      socket.broadcast.emit('user-disconnected', userId);
      socket.broadcast.emit('status-changed', {
        userId,
        status: 'offline',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error updating user status on disconnect:', error);
    }
  });
}; 