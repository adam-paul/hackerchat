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
  status: 'online' | 'away' | 'busy' | 'offline'
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

    return {
      success: true,
      data: {
        userId: socket.data.userId,
        status: validStatus
      }
    };
  } catch (error) {
    return handleSocketError(socket, error);
  }
}; 