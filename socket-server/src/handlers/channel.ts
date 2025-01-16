// socket-server/src/handlers/channel.ts

import type { SocketType, HandlerResult, ChannelPayload, CreateChannelPayload, UpdateChannelPayload, DeleteChannelPayload } from '../types/handlers';
import { channelSchema, createChannelSchema, updateChannelSchema, deleteChannelSchema } from '../types/handlers';
import { handleSocketError, validateEvent } from '../utils/errors';
import { EVENTS } from '../config/socket';
import { prisma } from '../lib/db';
import type { Channel } from '@prisma/client';

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

    // Generate a permanent ID if this is an optimistic update
    const permanentId = validData.originalId?.startsWith('temp_') 
      ? `channel_${Date.now()}_${Math.random().toString(36).slice(2)}`
      : undefined;

    // Create channel
    const channel = await prisma.channel.create({
      data: {
        id: permanentId, // Use generated permanent ID if this was an optimistic update
        name: validData.name,
        description: validData.description,
        parentId: validData.parentId,
        creatorId: socket.data.userId,
      }
    });

    // Join the channel room
    await socket.join(channel.id);

    // Format dates for socket emission
    const formattedChannel = {
      ...channel,
      createdAt: channel.createdAt.toISOString(),
      updatedAt: channel.updatedAt.toISOString(),
      originalId: validData.originalId // Include originalId in response
    };

    // Emit success to the creating client
    socket.emit(EVENTS.CHANNEL_CREATED, {
      channel: formattedChannel
    });

    // Broadcast channel creation to other clients
    socket.broadcast.emit(EVENTS.CHANNEL_CREATED, {
      channel: formattedChannel
    });

    return {
      success: true,
      data: channel
    };
  } catch (error) {
    // Emit error to the creating client
    socket.emit('message-error', {
      error: error instanceof Error ? error.message : 'Failed to create channel',
      code: 'INTERNAL_ERROR',
      channelId: data.originalId
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