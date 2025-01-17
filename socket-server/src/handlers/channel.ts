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

    console.log(`User ${socket.data.userId} joined channel ${data.channelId}`);

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
      });

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
          }
        });

        if (!message) {
          throw new Error('Source message not found');
        }

        await tx.message.update({
          where: { id: message.id }, // Use the real ID for the update
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
      originalId: validData.originalId // Include originalId in response for client reconciliation
    };

    // Emit success to the creating client with both IDs for reconciliation
    socket.emit(EVENTS.CHANNEL_CREATED, {
      ...formattedChannel,
      channelId: result.id,
      originalId: validData.originalId
    });

    // If this was a thread creation, emit message update
    if (validData.threadMetadata) {
      const { messageId, title } = validData.threadMetadata;
      console.log('[THREAD_CREATE] About to emit message update', {
        originalMessageId: messageId,
        threadTitle: title,
        threadId: result.id,
        userId: socket.data.userId
      });

      // Find the message again to get its real ID
      const message = await prisma.message.findFirst({
        where: {
          OR: [
            { id: messageId },
            { originalId: messageId }
          ]
        }
      });

      console.log('[THREAD_CREATE] Found message to update:', {
        messageFound: !!message,
        messageId: message?.id,
        originalId: message?.originalId
      });

      if (message) {
        // Emit to all clients including sender
        const updateEvent = {
          messageId: message.id,  // Use the real message ID
          threadId: result.id,
          threadMetadata: {
            title,
            createdAt: new Date(result.createdAt)
          }
        };
        console.log('[THREAD_CREATE] Emitting MESSAGE_UPDATED event:', updateEvent);
        socket.emit(EVENTS.MESSAGE_UPDATED, updateEvent);
      }
    }

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

    // Emit error to the creating client
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

    // Delete channel and all related data in a transaction
    await prisma.$transaction(async (tx) => {
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

    return {
      success: true,
      data: { channelId: validData.channelId }
    };
  } catch (error) {
    return handleSocketError(socket, error, data.channelId);
  }
}; 