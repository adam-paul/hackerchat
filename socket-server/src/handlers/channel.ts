// socket-server/src/handlers/channel.ts

import type { SocketType, HandlerResult, ChannelPayload, CreateChannelPayload, UpdateChannelPayload, DeleteChannelPayload } from '../types/handlers';
import { channelSchema, createChannelSchema, updateChannelSchema, deleteChannelSchema } from '../types/handlers';
import { handleSocketError, validateEvent } from '../utils/errors';
import { EVENTS } from '../config/socket';
import { prisma } from '../lib/db';
import type { Channel } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';

type ChannelResult = {
  channelId: string;
};

type TypingResult = {
  channelId: string;
  isTyping: boolean;
};

type ChannelWithThread = Channel & {
  threadMessage?: {
    id: string;
    channelId: string;
    originalId: string | null;
  };
};

export const handleJoinChannel = async (
  socket: SocketType,
  channelId: string
): Promise<HandlerResult<ChannelResult>> => {
  try {
    // Validate channel data
    const data = await validateEvent(channelSchema, { channelId });

    // Verify channel exists
    const channel = await prisma.channel.findUnique({
      where: { id: data.channelId }
    });

    if (!channel) {
      throw new Error('Channel not found');
    }

    // Join the channel room
    await socket.join(data.channelId);

    // Notify room that user has joined
    socket.to(data.channelId).emit(EVENTS.CHANNEL_JOINED, {
      channelId: data.channelId,
      userId: socket.data.userId,
      timestamp: new Date().toISOString()
    });

    return {
      success: true,
      data: { channelId: data.channelId }
    };
  } catch (error) {
    return handleSocketError(socket, error, channelId);
  }
};

export const handleLeaveChannel = async (
  socket: SocketType,
  channelId: string
): Promise<HandlerResult<ChannelResult>> => {
  try {
    // Validate channel data
    const data = await validateEvent(channelSchema, { channelId });

    // Verify channel exists
    const channel = await prisma.channel.findUnique({
      where: { id: data.channelId }
    });

    if (!channel) {
      throw new Error('Channel not found');
    }

    // Leave the channel room
    await socket.leave(data.channelId);

    // Notify room that user has left
    socket.to(data.channelId).emit(EVENTS.CHANNEL_LEFT, {
      channelId: data.channelId,
      userId: socket.data.userId,
      timestamp: new Date().toISOString()
    });

    console.log(`User ${socket.data.userId} left channel ${data.channelId}`);

    return {
      success: true,
      data: { channelId: data.channelId }
    };
  } catch (error) {
    return handleSocketError(socket, error, channelId);
  }
};

export const handleTyping = async (
  socket: SocketType,
  data: { channelId: string; isTyping: boolean }
): Promise<HandlerResult<TypingResult>> => {
  try {
    // Validate typing data
    const validData = await validateEvent(channelSchema, { channelId: data.channelId });

    // Broadcast typing status to channel
    const event = data.isTyping ? EVENTS.TYPING_START : EVENTS.TYPING_STOP;
    socket.to(validData.channelId).emit(event, {
      channelId: validData.channelId,
      userId: socket.data.userId,
      timestamp: new Date().toISOString()
    });

    return {
      success: true,
      data: { channelId: validData.channelId, isTyping: data.isTyping }
    };
  } catch (error) {
    return handleSocketError(socket, error, data.channelId);
  }
};

export const handleCreateChannel = async (
  socket: SocketType,
  data: CreateChannelPayload
): Promise<HandlerResult<Channel>> => {
  try {
    // Validate channel data
    const validData = await validateEvent(createChannelSchema, data);

    // Create channel and update message in a transaction if this is a thread
    const result = await prisma.$transaction(async (tx) => {
      // Create the channel
      const channel = await tx.channel.create({
        data: {
          name: validData.name,
          description: validData.description,
          parentId: validData.parentId,
          creatorId: socket.data.userId,
          originalId: validData.originalId?.startsWith('temp_') ? validData.originalId : undefined
        }
      }) as ChannelWithThread;

      // If this is a thread (has threadMetadata), update the source message
      if (validData.threadMetadata) {
        const { messageId, title, initialMessage } = validData.threadMetadata;
        
        // Find the message by either its real ID or optimistic ID
        const message = await tx.message.findFirst({
          where: {
            OR: [
              { id: messageId },
              { originalId: messageId }
            ]
          },
          select: {
            id: true,
            channelId: true,
            originalId: true
          }
        });

        if (!message) {
          throw new Error('Source message not found');
        }

        // Update the message with thread info
        await tx.message.update({
          where: { id: message.id },
          data: {
            threadId: channel.id,
            threadName: title
          }
        });

        // Create initial message in thread if content is provided
        if (initialMessage) {
          const messageId = `msg_${createId()}`;
          await tx.message.create({
            data: {
              id: messageId,
              content: initialMessage,
              channelId: channel.id,
              authorId: socket.data.userId
            }
          });
        }

        // Store message info for later broadcast
        channel.threadMessage = message;
      }

      return channel;
    });

    // Join the channel room
    await socket.join(result.id);

    // Format dates for socket emission
    const formattedChannel = {
      ...result,
      createdAt: result.createdAt.toISOString(),
      updatedAt: result.updatedAt.toISOString(),
      originalId: validData.originalId
    };

    // If this was a thread creation, emit message update BEFORE channel creation
    if (validData.threadMetadata && result.threadMessage) {
      const { title } = validData.threadMetadata;
      const message = result.threadMessage;
      
      // Create update events for both permanent and temporary IDs
      const updateEvents = [
        {
          messageId: message.id,
          threadId: result.id,
          threadMetadata: {
            title,
            createdAt: result.createdAt.toISOString()
          }
        }
      ];

      // If there was an original/temporary ID, create an update for that too
      if (message.originalId) {
        updateEvents.push({
          messageId: message.originalId,
          threadId: result.id,
          threadMetadata: {
            title,
            createdAt: result.createdAt.toISOString()
          }
        });
      }

      // Broadcast all update events to ensure all clients get the update
      updateEvents.forEach(event => {
        socket.to(message.channelId).emit(EVENTS.MESSAGE_UPDATED, event);
        socket.emit(EVENTS.MESSAGE_UPDATED, event);
      });
    }

    // Then emit channel creation events
    socket.emit(EVENTS.CHANNEL_CREATED, {
      ...formattedChannel,
      channelId: result.id,
      originalId: validData.originalId
    });

    // Broadcast channel creation to other clients
    socket.broadcast.emit(EVENTS.CHANNEL_CREATED, formattedChannel);

    return {
      success: true,
      data: result
    };
  } catch (error) {
    console.error('[CHANNEL_CREATE_ERROR]', {
      error,
      userId: socket.data.userId,
      channelData: data,
      stack: error instanceof Error ? error.stack : undefined
    });

    socket.emit(EVENTS.ERROR, {
      error: error instanceof Error ? error.message : 'Failed to create channel',
      code: 'INTERNAL_ERROR',
      channelId: data.originalId,
      timestamp: new Date().toISOString()
    });

    return handleSocketError(socket, error);
  }
};

export const handleUpdateChannel = async (
  socket: SocketType,
  data: UpdateChannelPayload
): Promise<HandlerResult<Channel>> => {
  try {
    // Validate update data
    const validData = await validateEvent(updateChannelSchema, data);

    // Verify channel exists and user has permission
    const existingChannel = await prisma.channel.findUnique({
      where: { id: validData.channelId }
    });

    if (!existingChannel) {
      throw new Error('Channel not found');
    }

    if (existingChannel.creatorId !== socket.data.userId) {
      throw new Error('Unauthorized to update channel');
    }

    // Update channel
    const channel = await prisma.channel.update({
      where: { id: validData.channelId },
      data: {
        name: validData.name,
        description: validData.description,
        updatedAt: new Date()
      }
    });

    // Format dates for socket emission
    const formattedChannel = {
      ...channel,
      createdAt: channel.createdAt.toISOString(),
      updatedAt: channel.updatedAt.toISOString()
    };

    // Broadcast update to all clients in the channel
    socket.to(channel.id).emit(EVENTS.CHANNEL_UPDATED, formattedChannel);

    return {
      success: true,
      data: channel
    };
  } catch (error) {
    return handleSocketError(socket, error, data.channelId);
  }
};

export const handleDeleteChannel = async (
  socket: SocketType,
  data: DeleteChannelPayload
): Promise<HandlerResult<{ channelId: string }>> => {
  try {
    // Validate delete data
    const validData = await validateEvent(deleteChannelSchema, data);

    // Verify channel exists and user has permission
    const channel = await prisma.channel.findUnique({
      where: { id: validData.channelId }
    });

    if (!channel) {
      throw new Error('Channel not found');
    }

    if (channel.creatorId !== socket.data.userId) {
      throw new Error('Unauthorized to delete channel');
    }

    // Find messages that reference this thread before deletion
    const messagesWithThread = await prisma.message.findMany({
      where: { threadId: validData.channelId },
      select: { id: true, channelId: true }
    });

    // Delete channel and all related data in a transaction
    await prisma.$transaction(async (tx) => {
      // Update messages that reference this thread
      if (messagesWithThread.length > 0) {
        await tx.message.updateMany({
          where: { threadId: validData.channelId },
          data: {
            threadId: null,
            threadName: null
          }
        });
      }

      // Delete all messages in the channel
      await tx.message.deleteMany({
        where: { channelId: validData.channelId }
      });

      // Delete the channel
      await tx.channel.delete({
        where: { id: validData.channelId }
      });
    });

    // Broadcast deletion to all clients
    socket.broadcast.emit(EVENTS.CHANNEL_DELETED, {
      channelId: validData.channelId,
      timestamp: new Date().toISOString()
    });

    // Emit message updates to remove thread links
    messagesWithThread.forEach(message => {
      const updateEvent = {
        messageId: message.id,
        threadId: null,
        threadMetadata: null
      };
      socket.to(message.channelId).emit(EVENTS.MESSAGE_UPDATED, updateEvent);
      socket.emit(EVENTS.MESSAGE_UPDATED, updateEvent);
    });

    return {
      success: true,
      data: { channelId: validData.channelId }
    };
  } catch (error) {
    return handleSocketError(socket, error, data.channelId);
  }
};

export const handleCreateDM = async (
  socket: SocketType,
  data: { participantIds: string[] }
): Promise<HandlerResult<Channel>> => {
  try {
    // Get the participant user
    const participant = await prisma.user.findUnique({
      where: { id: data.participantIds[0] },
      select: { id: true, name: true }
    });

    if (!participant) {
      throw new Error('Participant not found');
    }

    const isBot = participant.id.startsWith('bot_');

    // For bot DMs, create a unique channel name that includes the user's ID
    const channelName = isBot 
      ? `${participant.name || 'Bot'}_${socket.data.userId}`  // Include user ID for bot DMs
      : `DM with ${participant.name || 'Unknown User'}`;

    // Create new DM channel
    const channel = await prisma.channel.create({
      data: {
        name: channelName,
        type: 'DM',
        creatorId: socket.data.userId,
        participants: {
          connect: [
            { id: socket.data.userId },
            { id: participant.id }
          ]
        }
      },
      include: {
        participants: {
          select: {
            id: true,
            name: true,
            imageUrl: true,
            status: true
          }
        }
      }
    });

    // Join the channel room
    await socket.join(channel.id);

    // Format dates for socket emission
    const formattedChannel = {
      ...channel,
      createdAt: channel.createdAt.toISOString(),
      updatedAt: channel.updatedAt.toISOString()
    };

    // For bot DMs, broadcast to all sockets to ensure the bot receives it
    socket.emit(EVENTS.CHANNEL_CREATED, formattedChannel);
    socket.broadcast.emit(EVENTS.CHANNEL_CREATED, formattedChannel);

    return {
      success: true,
      data: channel
    };
  } catch (error) {
    console.error('[DM_CREATE_ERROR]', {
      error,
      userId: socket.data.userId,
      participantIds: data.participantIds,
      stack: error instanceof Error ? error.stack : undefined
    });

    socket.emit(EVENTS.ERROR, {
      error: error instanceof Error ? error.message : 'Failed to create DM',
      code: 'INTERNAL_ERROR',
      timestamp: new Date().toISOString()
    });

    return handleSocketError(socket, error);
  }
}; 