// socket-server/src/middleware/auth.ts

import { Socket } from 'socket.io';
import { clerkClient } from '@clerk/clerk-sdk-node';
import type { SocketType } from '../types/handlers';
import { verifyToken } from '@clerk/backend';
import { ENV } from '../config/environment';
import { prisma } from '../lib/db';

export const authMiddleware = async (
  socket: SocketType,
  next: (err?: Error) => void
) => {
  try {
    const token = socket.handshake.auth.token;
    const authType = socket.handshake.auth.type;

    if (!token) {
      console.error('Authentication token missing');
      return next(new Error('Authentication token missing'));
    }

    // Handle webhook authentication
    if (authType === 'webhook') {
      if (token !== process.env.SOCKET_WEBHOOK_SECRET) {
        next(new Error('Invalid webhook token'));
        return;
      }

      // Set webhook socket data
      socket.data = {
        userId: 'bot_mr_robot',  // Use consistent bot ID
        userName: 'mr_robot',    // Use consistent bot name
        imageUrl: null          // Bots don't have images
      };

      next();
      return;
    }

    // Regular user authentication
    // Remove 'Bearer ' prefix if present
    const cleanToken = token.replace('Bearer ', '');

    try {
      // Verify the session token without network call
      const session = await verifyToken(cleanToken, {
        secretKey: ENV.CLERK_SECRET_KEY,
        issuer: ENV.CLERK_ISSUER,
        audience: ENV.CLERK_AUDIENCE,
        clockSkewInMs: 60000 // Allow 1 minute of clock skew
      });

      if (!session?.sub) {
        console.error('Invalid session - no userId found');
        return next(new Error('Invalid session'));
      }

      // Check if session is expired
      const now = Math.floor(Date.now() / 1000);
      if (session.exp && now >= session.exp) {
        console.error('Session expired:', {
          userId: session.sub,
          expiry: new Date(session.exp * 1000).toISOString(),
          now: new Date().toISOString()
        });
        return next(new Error('Session expired'));
      }

      // Get user details
      const user = await clerkClient.users.getUser(session.sub);
      
      // Create or update user in database
      await prisma.user.upsert({
        where: { id: session.sub },
        create: {
          id: session.sub,
          name: user.username || 'Anonymous',
          imageUrl: user.imageUrl,
          status: 'online'
        },
        update: {
          name: user.username || 'Anonymous',
          imageUrl: user.imageUrl,
          // Don't update status on reconnect - keep existing status
        }
      });

      // Attach user data to socket
      socket.data.userId = session.sub;
      socket.data.userName = user.username || 'Anonymous';
      socket.data.imageUrl = user.imageUrl;

      console.log('User authenticated:', {
        userId: session.sub,
        userName: socket.data.userName
      });

      next();
    } catch (error) {
      console.error('Token verification failed:', error);
      return next(new Error('Invalid token'));
    }
  } catch (error) {
    console.error('Authentication failed:', error);
    return next(new Error('Authentication failed'));
  }
}; 