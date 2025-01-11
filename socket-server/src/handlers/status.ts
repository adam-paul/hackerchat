import type { SocketType, HandlerResult } from '../types/handlers';
import { handleSocketError } from '../utils/errors';
import { prisma } from '../lib/db';
import { z } from 'zod';

const statusSchema = z.enum(['online', 'away', 'busy', 'offline']);

type StatusResult = {
  userId: string;
  status: 'online' | 'away' | 'busy' | 'offline';
};

export const handleStatusUpdate = async (
  socket: SocketType,
  status: 'online' | 'away' | 'busy' | 'offline',
  callback?: (response: { success: boolean; error?: string }) => void
): Promise<HandlerResult<StatusResult>> => {
  try {
    // Validate status
    const validStatus = statusSchema.parse(status);

    // Update user status in database
    await prisma.user.update({
      where: { id: socket.data.userId },
      data: { status: validStatus }
    });

    // Broadcast status update to all connected clients
    socket.broadcast.emit('status-changed', {
      userId: socket.data.userId,
      status: validStatus,
      timestamp: new Date().toISOString()
    });

    // Send acknowledgment to the client
    if (callback) {
      callback({ success: true });
    }

    return {
      success: true,
      data: {
        userId: socket.data.userId,
        status: validStatus
      }
    };
  } catch (error) {
    // Send error to the client
    if (callback) {
      callback({
        success: false,
        error: error instanceof Error ? error.message : 'Status update failed'
      });
    }
    return handleSocketError(socket, error);
  }
}; 