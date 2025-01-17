import type { SocketType } from '../types/handlers';
import type { ReactionEvent } from '../types';
import { prisma } from '../lib/db';
import { EVENTS } from '../config/socket';

export const handleAddReaction = async (socket: SocketType, event: ReactionEvent): Promise<void> => {
  try {
    const { messageId, reaction } = event;
    const userId = socket.data.userId;

    // Check if this is an optimistic message
    const message = await prisma.message.findFirst({
      where: {
        OR: [
          { id: messageId },
          { originalId: messageId }
        ]
      }
    });

    if (!message) {
      console.error('Message not found:', messageId);
      socket.emit(EVENTS.ERROR, {
        error: 'Message not found',
        code: 'REACTION_ERROR',
        channelId: event.channelId,
      });
      return;
    }

    // Create reaction in database using the real message ID
    const newReaction = await prisma.reaction.create({
      data: {
        content: reaction.content,
        messageId: message.id, // Use the real message ID
        userId,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            imageUrl: true,
          },
        },
      },
    });

    // Broadcast reaction to all clients in the channel
    socket.to(event.channelId).emit(EVENTS.REACTION_ADDED, {
      type: 'reaction',
      channelId: event.channelId,
      messageId: message.id, // Use permanent ID
      originalId: message.originalId, // Include original ID if it exists
      reaction: {
        id: newReaction.id,
        content: newReaction.content,
        createdAt: newReaction.createdAt.toISOString(),
        user: newReaction.user,
      },
    });

    // Send confirmation to sender
    socket.emit(EVENTS.REACTION_ADDED, {
      type: 'reaction',
      channelId: event.channelId,
      messageId: message.id, // Use permanent ID
      originalId: message.originalId, // Include original ID if it exists
      reaction: {
        id: newReaction.id,
        content: newReaction.content,
        createdAt: newReaction.createdAt.toISOString(),
        user: newReaction.user,
      },
    });
  } catch (error) {
    console.error('Error adding reaction:', error);
    socket.emit(EVENTS.ERROR, {
      error: 'Failed to add reaction',
      code: 'REACTION_ERROR',
      channelId: event.channelId,
    });
  }
};

export const handleRemoveReaction = async (socket: SocketType, event: ReactionEvent): Promise<void> => {
  try {
    const { messageId, reaction } = event;
    const userId = socket.data.userId;

    // Check if this is an optimistic message
    const message = await prisma.message.findFirst({
      where: {
        OR: [
          { id: messageId },
          { originalId: messageId }
        ]
      }
    });

    if (!message) {
      console.error('Message not found:', messageId);
      socket.emit(EVENTS.ERROR, {
        error: 'Message not found',
        code: 'REACTION_ERROR',
        channelId: event.channelId,
      });
      return;
    }

    // Delete reaction from database
    await prisma.reaction.delete({
      where: {
        id: reaction.id,
        userId, // Ensure user owns the reaction
        messageId: message.id, // Use the real message ID
      },
    });

    // Broadcast removal to all clients in the channel
    socket.to(event.channelId).emit(EVENTS.REACTION_REMOVED, {
      type: 'reaction',
      channelId: event.channelId,
      messageId: message.id, // Use permanent ID
      originalId: message.originalId, // Include original ID if it exists
      reaction: {
        id: reaction.id,
        content: reaction.content,
        createdAt: reaction.createdAt,
        user: reaction.user,
      },
    });

    // Send confirmation to sender
    socket.emit(EVENTS.REACTION_REMOVED, {
      type: 'reaction',
      channelId: event.channelId,
      messageId: message.id, // Use permanent ID
      originalId: message.originalId, // Include original ID if it exists
      reaction: {
        id: reaction.id,
        content: reaction.content,
        createdAt: reaction.createdAt,
        user: reaction.user,
      },
    });
  } catch (error) {
    console.error('Error removing reaction:', error);
    socket.emit(EVENTS.ERROR, {
      error: 'Failed to remove reaction',
      code: 'REACTION_ERROR',
      channelId: event.channelId,
    });
  }
}; 