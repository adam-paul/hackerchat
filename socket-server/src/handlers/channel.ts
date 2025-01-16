// socket-server/src/handlers/channel.ts

import type { SocketType, HandlerResult, ChannelPayload } from '../types/handlers';
import { channelSchema } from '../types/handlers';
import { handleSocketError, validateEvent } from '../utils/errors';
import { EVENTS } from '../config/socket';
import { prisma } from '../lib/db';

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

export const handleChannelCreate = async (
  socket: SocketType,
  data: {
    name: string;
    description?: string;
    parentId?: string;
    initialMessage?: {
      content: string;
      authorId: string;
      fileUrl?: string;
      fileName?: string;
      fileType?: string;
      fileSize?: number;
      originalId?: string;
    };
    messageId?: string;
    originalId?: string;
  }
): Promise<HandlerResult<any>> => {
  try {
    // Create channel and initial message in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create the channel
      const channel = await tx.channel.create({
        data: {
          id: data.originalId?.startsWith('temp_') ? 
            `channel_${Date.now()}_${Math.random().toString(36).slice(2)}` : 
            data.originalId || undefined,
          name: data.name,
          description: data.description,
          parentId: data.parentId,
          creatorId: socket.data.userId,
        },
        include: {
          _count: {
            select: { messages: true }
          }
        }
      });

      // If this is a thread creation, update the original message
      if (data.messageId) {
        const messageToUpdate = await tx.message.findFirst({
          where: {
            OR: [
              { id: data.messageId },
              { originalId: data.messageId }
            ]
          }
        });

        if (messageToUpdate) {
          await tx.message.update({
            where: { id: messageToUpdate.id },
            data: {
              threadId: channel.id,
              threadName: data.name
            }
          });
        }
      }

      // If initialMessage is provided, create it
      if (data.initialMessage) {
        await tx.message.create({
          data: {
            id: `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            content: data.initialMessage.content,
            channelId: channel.id,
            authorId: data.initialMessage.authorId,
            fileUrl: data.initialMessage.fileUrl,
            fileName: data.initialMessage.fileName,
            fileType: data.initialMessage.fileType,
            fileSize: data.initialMessage.fileSize,
            originalId: data.initialMessage.originalId
          }
        });
      }

      return channel;
    });

    const formattedChannel = {
      ...result,
      createdAt: result.createdAt.toISOString(),
      updatedAt: result.updatedAt.toISOString(),
      originalId: data.originalId?.startsWith('temp_') ? data.originalId : undefined
    };

    // Broadcast to all clients including sender
    socket.broadcast.emit(EVENTS.CHANNEL_CREATED, formattedChannel);
    socket.emit(EVENTS.CHANNEL_CREATED, formattedChannel);

    return {
      success: true,
      data: formattedChannel
    };
  } catch (error) {
    console.error("[CHANNEL_CREATE_HANDLER] Error:", error);
    return handleSocketError(socket, error);
  }
}; 