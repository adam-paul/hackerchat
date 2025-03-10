// socket-server/src/routes/broadcast.ts

import { Router } from 'express';
import { prisma } from '../lib/db';
import { io } from '../index';
import { registerUserActivity, forceLogoutUser } from '../utils/session-monitor';

const router = Router();

// Middleware to verify webhook secret
const verifyWebhookSecret = (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${process.env.SOCKET_WEBHOOK_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

// Route to broadcast status changes
router.post('/broadcast-status', verifyWebhookSecret, async (req, res) => {
  const { userId, status, source } = req.body;

  if (!userId || !status) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Log the broadcast attempt
    console.log('Broadcasting status change:', { userId, status, source });

    // If this is not from the session monitor and status is not offline, register activity
    if (source !== 'session-monitor' && status !== 'offline') {
      registerUserActivity(userId);
    }

    // Broadcast the status change to all connected clients
    io.emit('status-changed', {
      userId,
      status,
      timestamp: new Date().toISOString()
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Broadcast error:', error);
    res.status(500).json({ error: 'Failed to broadcast status' });
  }
});

// API endpoint to get status of all active users
router.get('/active-users', verifyWebhookSecret, async (req, res) => {
  try {
    // Get all users marked as active in the database
    const activeUsers = await prisma.user.findMany({
      where: {
        status: { in: ['online', 'away', 'busy'] }
      },
      select: { 
        id: true, 
        name: true, 
        status: true, 
        updatedAt: true
      }
    });
    
    // Check which users have active socket connections
    const connectedUsers = Array.from(io.sockets.sockets.values()).map(socket => socket.data?.userId);
    
    // Return enriched user data with connection status
    const enrichedUsers = activeUsers.map(user => {
      const isConnected = connectedUsers.includes(user.id);
      const lastUpdated = new Date(user.updatedAt).getTime();
      const timeSinceUpdate = Math.floor((Date.now() - lastUpdated) / 1000);
      
      return {
        id: user.id,
        name: user.name,
        status: user.status,
        isConnected,
        updatedAt: user.updatedAt,
        timeSinceUpdate: `${timeSinceUpdate}s ago`
      };
    });
    
    res.json({ 
      activeUsers: enrichedUsers,
      socketCount: io.sockets.sockets.size
    });
  } catch (error) {
    console.error('Error getting active users:', error);
    res.status(500).json({ error: 'Failed to get active users' });
  }
});

// API endpoint to force logout a user
router.post('/force-logout', verifyWebhookSecret, async (req, res) => {
  const { userId } = req.body;
  
  if (!userId) {
    return res.status(400).json({ error: 'Missing userId field' });
  }
  
  try {
    // Get user details first for response
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, status: true }
    });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Force logout the user
    const success = await forceLogoutUser(userId);
    
    if (success) {
      res.json({ 
        success: true,
        message: `User ${user.name} (${user.id}) with status ${user.status} has been logged out`,
        user
      });
    } else {
      res.status(500).json({ error: 'Failed to force logout user' });
    }
  } catch (error) {
    console.error('Error forcing logout:', error);
    res.status(500).json({ error: 'Failed to force logout user' });
  }
});

export default router;
