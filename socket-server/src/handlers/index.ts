// socket-server/src/handlers/index.ts

import type { SocketType } from '../types/handlers';
import type { MessageEvent } from '../types';
import { handleJoinChannel, handleLeaveChannel, handleTyping } from './channel';
import { handleMessage, handleMessageReceived, handleMessageDelete } from './message';
import { handleStatusUpdate } from './status';
import { EVENTS } from '../config/socket';

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

  // Status events
  socket.on('status-update', async (status: 'online' | 'away' | 'busy' | 'offline') => {
    await handleStatusUpdate(socket, status);
  });

  // Typing events
  socket.on(EVENTS.TYPING_START, async (channelId: string) => {
    await handleTyping(socket, { channelId, isTyping: true });
  });

  socket.on(EVENTS.TYPING_STOP, async (channelId: string) => {
    await handleTyping(socket, { channelId, isTyping: false });
  });

  // Disconnect event
  socket.on(EVENTS.DISCONNECT, () => {
    // Remove user from connected users
    connectedUsers.delete(userId);
    // Broadcast user disconnected event to all clients
    socket.broadcast.emit('user-disconnected', userId);
  });
}; 