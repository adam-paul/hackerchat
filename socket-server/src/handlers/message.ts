// socket-server/src/handlers/message.ts

import type { SocketType, HandlerResult, MessagePayload } from '../types/handlers';
import type { MessageEvent } from '../types';
import { messageSchema } from '../types/handlers';
import { handleSocketError, validateEvent } from '../utils/errors';
import { EVENTS } from '../config/socket';
import { prisma } from '../lib/db';
import { MAX_RETRIES, RETRY_DELAY } from '../config/constants';
import { createId } from '@paralleldrive/cuid2';

type MessageResult = {
  messageId: string;
};

// Map to track temporary to permanent ID mappings
const tempToPermanentIds = new Map<string, string>();

const persistMessage = async (data: MessagePayload, userId: string, retryCount = 0): Promise<any> => {
  try {
    // Verify channel exists
    const channel = await prisma.channel.findUnique({
      where: { id: data.channelId }
    });

    if (!channel) {
      throw new Error('Channel not found');
    }

    // Verify user exists
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Generate a new unique ID for the message using cuid
    const messageId = `msg_${createId()}`;

    // If this message is replying to a temporary message, get its permanent ID
    let replyToId = data.replyToId;
    if (replyToId?.startsWith('temp_')) {
      const permanentId = tempToPermanentIds.get(replyToId);
      if (!permanentId) {
        throw new Error('Referenced message not found');
      }
      replyToId = permanentId;
    }

    const result = await prisma.message.create({
      data: {
        id: messageId,
        content: data.content,
        fileUrl: data.fileUrl,
        fileName: data.fileName,
        fileType: data.fileType,
        fileSize: data.fileSize,
        channelId: data.channelId,
        authorId: userId,
        originalId: data.messageId.startsWith('temp_') ? data.messageId : undefined,
        replyToId
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            imageUrl: true
          }
        },
        replyTo: {
          select: {
            id: true,
            content: true,
            author: {
              select: {
                id: true,
                name: true
              }
            }
          }
        }
      }
    });

    // Store the mapping if this was a temporary message
    if (data.messageId.startsWith('temp_')) {
      tempToPermanentIds.set(data.messageId, messageId);
    }

    return result;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002' && retryCount < MAX_RETRIES) {
      // If we hit a unique constraint error, retry with a new ID
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      return persistMessage(data, userId, retryCount + 1);
    }
    throw error;
  }
};

// Clean up old mappings periodically
setInterval(() => {
  const now = Date.now();
  for (const [tempId] of tempToPermanentIds) {
    // Extract timestamp from temp_* ID and remove if older than 5 minutes
    const timestamp = parseInt(tempId.split('_')[1]);
    if (now - timestamp > 5 * 60 * 1000) {
      tempToPermanentIds.delete(tempId);
    }
  }
}, 60 * 1000); // Run cleanup every minute

export const handleMessage = async (
  socket: SocketType,
  messageData: MessagePayload & { messageId: string }
): Promise<HandlerResult<MessageEvent>> => {
  try {
    // Validate message data
    const data = await validateEvent(messageSchema, messageData);

    // Persist message to database with retries
    const dbMessage = await persistMessage(data, socket.data.userId);

    // If this was a temporary message, update any replies that reference it
    if (data.messageId.startsWith('temp_')) {
      await prisma.message.updateMany({
        where: { replyToId: data.messageId },
        data: { replyToId: dbMessage.id }
      });
    }

    // Create the message event
    const messageEvent: MessageEvent = {
      type: 'message',
      channelId: data.channelId,
      messageId: dbMessage.id,
      message: {
        id: dbMessage.id,
        content: dbMessage.content,
        channelId: dbMessage.channelId,
        fileUrl: dbMessage.fileUrl || undefined,
        fileName: dbMessage.fileName || undefined,
        fileType: dbMessage.fileType || undefined,
        fileSize: dbMessage.fileSize || undefined,
        createdAt: dbMessage.createdAt.toISOString(),
        author: {
          id: socket.data.userId,
          name: socket.data.userName || 'Anonymous',
          imageUrl: socket.data.imageUrl || null
        },
        ...(dbMessage.replyTo && {
          replyTo: {
            id: dbMessage.replyTo.id,
            content: dbMessage.replyTo.content,
            author: {
              id: dbMessage.replyTo.author.id,
              name: dbMessage.replyTo.author.name
            }
          }
        }),
        originalId: data.messageId.startsWith('temp_') ? data.messageId : undefined
      }
    };

    // Broadcast message to channel
    socket.to(data.channelId).emit(EVENTS.MESSAGE, messageEvent);

    // Send delivery confirmation to sender
    socket.emit(EVENTS.MESSAGE_DELIVERED, {
      messageId: dbMessage.id,
      originalId: data.messageId.startsWith('temp_') ? data.messageId : undefined,
      channelId: data.channelId,
      timestamp: new Date().toISOString(),
      message: messageEvent.message
    });

    return {
      success: true,
      data: messageEvent
    };
  } catch (error) {
    // Log detailed error information
    console.error('[MESSAGE_HANDLER_ERROR]', {
      error,
      userId: socket.data.userId,
      messageData
    });

    // Send error event to client
    socket.emit(EVENTS.MESSAGE_ERROR, {
      messageId: messageData.messageId,
      error: error instanceof Error ? error.message : 'Failed to process message',
      timestamp: new Date().toISOString()
    });

    return handleSocketError(socket, error, messageData.channelId);
  }
};

export const handleMessageReceived = async (
  socket: SocketType,
  messageId: string
): Promise<HandlerResult<MessageResult>> => {
  try {
    // Update message status in database
    await prisma.message.update({
      where: { id: messageId },
      data: { status: 'DELIVERED' }
    });

    // Emit message received confirmation
    socket.emit(EVENTS.MESSAGE_RECEIVED, {
      messageId,
      userId: socket.data.userId,
      timestamp: new Date().toISOString()
    });

    return {
      success: true,
      data: { messageId }
    };
  } catch (error) {
    console.error('[MESSAGE_RECEIVED_ERROR]', {
      error,
      userId: socket.data.userId,
      messageId
    });
    return handleSocketError(socket, error);
  }
};

export const handleMessageDelete = async (
  socket: SocketType,
  messageId: string
): Promise<HandlerResult<MessageResult>> => {
  try {
    // Find the message and verify ownership
    const message = await prisma.message.findFirst({
      where: {
        OR: [
          { id: messageId },
          { originalId: messageId }
        ]
      },
      select: {
        id: true,
        authorId: true,
        channelId: true,
        originalId: true
      }
    });

    if (!message) {
      throw new Error('Message not found');
    }

    if (message.authorId !== socket.data.userId) {
      throw new Error('Unauthorized to delete this message');
    }

    // Delete the message
    await prisma.message.delete({
      where: { id: message.id }
    });

    // Broadcast deletion to channel with both IDs
    const deletionEvent = {
      messageId: message.id,
      originalId: message.originalId,
      channelId: message.channelId,
      timestamp: new Date().toISOString()
    };

    socket.to(message.channelId).emit(EVENTS.MESSAGE_DELETED, deletionEvent);
    socket.emit(EVENTS.MESSAGE_DELETED, deletionEvent);

    return {
      success: true,
      data: { messageId: message.id }
    };
  } catch (error) {
    console.error('[MESSAGE_DELETE_ERROR]', {
      error,
      userId: socket.data.userId,
      messageId
    });
    return handleSocketError(socket, error);
  }
}; 