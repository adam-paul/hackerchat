// socket-server/src/handlers/index.ts

import type { SocketType, MessagePayload, MessageUpdatePayload } from '../types/handlers';
import type { MessageEvent, ReactionEvent } from '../types';
import { 
  handleJoinChannel, 
  handleLeaveChannel, 
  handleTyping,
  handleCreateChannel,
  handleUpdateChannel,
  handleDeleteChannel,
  handleCreateDM
} from './channel';
import { handleMessage, handleMessageDelete, handleMessageUpdate } from './message';
import { handleStatusUpdate } from './status';
import { handleAddReaction, handleRemoveReaction } from './reaction';
import { EVENTS } from '../config/socket';
import { prisma } from '../lib/db';
import { registerUserConnect, registerUserActivity, registerUserDisconnect } from '../utils/session-monitor';

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

  // Register connection with session monitor
  registerUserConnect(userId);

  // Send currently connected users to the new client
  socket.emit('connected-users', Array.from(connectedUsers));

  // Get user's current status and broadcast connection
  prisma.user.findUnique({
    where: { id: userId },
    select: { status: true }
  }).then(user => {
    if (user) {
      // Broadcast user connected event with their current status
      socket.broadcast.emit('status-changed', {
        userId,
        status: user.status,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Channel events
  socket.on(EVENTS.JOIN_CHANNEL, async (channelId: string) => {
    await handleJoinChannel(socket, channelId);
  });

  socket.on(EVENTS.LEAVE_CHANNEL, async (channelId: string) => {
    await handleLeaveChannel(socket, channelId);
  });

  socket.on(EVENTS.CREATE_CHANNEL, async (data) => {
    await handleCreateChannel(socket, data);
  });

  socket.on('create-dm', async (data, callback) => {
    const result = await handleCreateDM(socket, data);
    callback(result);
  });

  socket.on(EVENTS.UPDATE_CHANNEL, async (data) => {
    await handleUpdateChannel(socket, data);
  });

  socket.on(EVENTS.DELETE_CHANNEL, async (data) => {
    await handleDeleteChannel(socket, data);
  });

  // Message events
  socket.on(EVENTS.MESSAGE, (data: MessageEvent) => handleMessage(socket, {
    content: data.message.content,
    channelId: data.channelId,
    messageId: data.messageId,
    fileUrl: data.message.fileUrl,
    fileName: data.message.fileName,
    fileType: data.message.fileType,
    fileSize: data.message.fileSize,
    replyToId: data.message.replyToId
  }));
  socket.on(EVENTS.MESSAGE_DELETED, (messageId: string) => handleMessageDelete(socket, messageId));
  socket.on(EVENTS.MESSAGE_UPDATED, (data: MessageUpdatePayload) => handleMessageUpdate(socket, data));

  // Reaction events
  socket.on(EVENTS.ADD_REACTION, async (data: ReactionEvent) => {
    await handleAddReaction(socket, data);
  });

  socket.on(EVENTS.REMOVE_REACTION, async (data: ReactionEvent) => {
    await handleRemoveReaction(socket, data);
  });

  // Status events
  socket.on(EVENTS.STATUS_UPDATE, async (status: 'online' | 'away' | 'busy' | 'offline') => {
    await handleStatusUpdate(socket, status);
  });

  // Bot registration event
  socket.on(EVENTS.REGISTER_BOT, async (data: { botId: string, name: string, status: string }) => {
    try {
      // Update or create bot user
      const bot = await prisma.user.upsert({
        where: { id: data.botId },
        update: { 
          name: data.name,
          status: data.status as 'online' | 'away' | 'busy' | 'offline'
        },
        create: {
          id: data.botId,
          name: data.name,
          status: data.status as 'online' | 'away' | 'busy' | 'offline'
        }
      });

      // Broadcast bot's status to all clients
      socket.broadcast.emit('status-changed', {
        userId: bot.id,
        status: bot.status,
        timestamp: new Date().toISOString()
      });

      console.log(`[BOT_REGISTERED] Bot ${bot.name} (${bot.id}) registered with status ${bot.status}`);
    } catch (error) {
      console.error('[BOT_REGISTER_ERROR]', {
        error,
        botData: data,
        stack: error instanceof Error ? error.stack : undefined
      });
      socket.emit(EVENTS.ERROR, {
        error: error instanceof Error ? error.message : 'Failed to register bot',
        code: 'INTERNAL_ERROR',
        timestamp: new Date().toISOString()
      });
    }
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
    
    // Register disconnect with session monitor
    registerUserDisconnect(userId);
    
    // Broadcast user disconnected event to all clients
    socket.broadcast.emit('user-disconnected', userId);
  });
};
