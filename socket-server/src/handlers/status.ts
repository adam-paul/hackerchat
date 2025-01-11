import type { SocketType, HandlerResult } from '../types/handlers';
import { handleSocketError } from '../utils/errors';
import { prisma } from '../lib/db';
import { z } from 'zod';

const statusSchema = z.enum(['online', 'away', 'busy', 'offline']);
type Status = z.infer<typeof statusSchema>;

type StatusResult = {
  userId: string;
  status: Status;
  timestamp: string;
};

export const handleStatusUpdate = async (
  socket: SocketType,
  status: Status
): Promise<HandlerResult<StatusResult>> => {
  try {
    // Validate status
    const validStatus = statusSchema.parse(status);
    const timestamp = new Date().toISOString();

    // Update user status in database first
    const updatedUser = await prisma.user.update({
      where: { id: socket.data.userId },
      data: { status: validStatus },
      select: {
        id: true,
        status: true
      }
    });

    // Only broadcast if DB update was successful
    if (updatedUser) {
      const statusUpdate: StatusResult = {
        userId: updatedUser.id,
        status: updatedUser.status as Status,
        timestamp
      };

      // Broadcast to all clients including sender
      socket.broadcast.emit('status-changed', statusUpdate);
      socket.emit('status-changed', statusUpdate);

      return {
        success: true,
        data: statusUpdate
      };
    }

    throw new Error('Failed to update user status');
  } catch (error) {
    return handleSocketError(socket, error);
  }
}; 