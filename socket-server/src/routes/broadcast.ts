// socket-server/src/routes/broadcast.ts

import { Router } from 'express';
import { prisma } from '../lib/db';
import { io } from '../index';

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
  const { userId, status } = req.body;

  if (!userId || !status) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Log the broadcast attempt
    console.log('Broadcasting status change:', { userId, status });

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

// Route to broadcast channel creation
router.post('/channel-created', verifyWebhookSecret, async (req, res) => {
  const channel = req.body;

  if (!channel || !channel.id) {
    return res.status(400).json({ error: 'Invalid channel data' });
  }

  try {
    // Log the broadcast attempt
    console.log('Broadcasting channel creation:', channel);

    // Broadcast the channel creation to all connected clients
    io.emit('channel:created', channel);

    res.json({ success: true });
  } catch (error) {
    console.error('Broadcast error:', error);
    res.status(500).json({ error: 'Failed to broadcast channel creation' });
  }
});

export default router;
