// socket-server/src/middleware/auth.ts

import type { Request, Response, NextFunction } from 'express';
import type { Socket } from 'socket.io';
import { prisma } from '../lib/db';

// Socket authentication middleware
export const authMiddleware = async (socket: Socket, next: (err?: Error) => void) => {
  const token = socket.handshake.auth.token;
  
  if (!token) {
    return next(new Error('Authentication error'));
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: token }
    });

    if (!user) {
      return next(new Error('User not found'));
    }

    socket.data.userId = user.id;
    next();
  } catch (error) {
    next(new Error('Authentication error'));
  }
};

// Webhook authentication middleware
export const verifyWebhookSecret = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${process.env.SOCKET_WEBHOOK_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}; 