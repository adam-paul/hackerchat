import type { SocketType, HandlerResult } from '../types/handlers';
import { handleSocketError } from '../utils/errors';
import { prisma } from '../lib/db';
import { z } from 'zod';
import { registerUserActivity } from '../utils/session-monitor';

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
    console.log(`[StatusHandler] Received status update request: ${status} for user ID: ${socket.data.userId}`);
    
    // Validate status
    const validStatus = statusSchema.parse(status);
    const timestamp = new Date().toISOString();
    const userId = socket.data.userId;
    
    console.log(`[StatusHandler] Validated status update: ${validStatus} for user ${userId}`);

    // Register user activity in session monitor (except for 'offline' status)
    if (validStatus !== 'offline') {
      registerUserActivity(userId);
    }

    // Update user status in database first
    console.log(`[StatusHandler] Updating database status for user ${userId} to ${validStatus}`);
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { status: validStatus },
      select: {
        id: true,
        status: true,
        name: true
      }
    });

    // Only broadcast if DB update was successful
    if (updatedUser) {
      console.log(`[StatusHandler] Database updated successfully for ${updatedUser.name} (${updatedUser.id}): ${updatedUser.status}`);
      
      const statusUpdate: StatusResult = {
        userId: updatedUser.id,
        status: updatedUser.status as Status,
        timestamp
      };

      // Broadcast to all clients including sender
      console.log(`[StatusHandler] Broadcasting status update to all clients: ${JSON.stringify(statusUpdate)}`);
      socket.broadcast.emit('status-changed', statusUpdate);
      socket.emit('status-changed', statusUpdate);

      return {
        success: true,
        data: statusUpdate
      };
    }

    console.error(`[StatusHandler] Failed to update user status in database for user ${userId}`);
    throw new Error('Failed to update user status');
  } catch (error) {
    console.error(`[StatusHandler] Error handling status update:`, error);
    return handleSocketError(socket, error);
  }
}; 