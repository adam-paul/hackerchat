// socket-server/src/handlers/channel.ts

import type { SocketType, HandlerResult, ChannelPayload, UpdateChannelPayload, DeleteChannelPayload } from '../types/handlers';
import { channelSchema, updateChannelSchema, deleteChannelSchema } from '../types/handlers';
import { handleSocketError, validateEvent } from '../utils/errors';
import { EVENTS } from '../config/socket';
import { prisma } from '../lib/db';
import type { Channel } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';
import { z } from 'zod';

type ChannelResult = {
  channelId: string;
};

type TypingResult = {
  channelId: string;
  isTyping: boolean;
};

interface ThreadMetadata {
  messageId: string;
  content: string;
}

interface CreateChannelData {
  name: string;
  parentId?: string;
  description?: string;
  originalId?: string;
  threadMetadata?: ThreadMetadata;
}

const createChannelValidation = z.object({
  name: z.string(),
  parentId: z.string().optional(),
  description: z.string().optional(),
  originalId: z.string().optional(),
  threadMetadata: z.object({
    messageId: z.string(),
    content: z.string(),
  }).optional(),
});

export const handleCreateChannel = async (
  socket: SocketType,
  data: CreateChannelData
): Promise<HandlerResult<Channel>> => {
  try {
    const validData = await validateEvent(createChannelValidation, data);
    const channelId = createId();

    // Use transaction to ensure atomicity
    const result = await prisma.$transaction(async (tx) => {
      // Create the channel
      const channel = await tx.channel.create({
        data: {
          id: channelId,
          name: validData.name,
          description: validData.description,
          parentId: validData.parentId,
          originalId: validData.originalId,
          creatorId: socket.data.userId,
        },
      });

      // If this is a thread, update the original message and create initial message
      if (validData.threadMetadata) {
        // Update original message with thread reference
        await tx.message.update({
          where: { id: validData.threadMetadata.messageId },
          data: { threadId: channelId },
        });

        // Create initial message in thread
        await tx.message.create({
          data: {
            id: createId(),
            content: validData.threadMetadata.content,
            channelId: channelId,
            authorId: socket.data.userId,
          },
        });
      }

      return channel;
    });

    // Join the newly created channel
    await socket.join(channelId);

    // Broadcast channel creation
    socket.broadcast.emit(EVENTS.CHANNEL_CREATED, result);

    // If this is a thread, broadcast message update
    if (validData.threadMetadata) {
      const updatedMessage = await prisma.message.findUnique({
        where: { id: validData.threadMetadata.messageId },
      });
      if (updatedMessage) {
        socket.broadcast.emit(EVENTS.MESSAGE_UPDATED, updatedMessage);
      }
    }

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    return handleSocketError(socket, error);
  }
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