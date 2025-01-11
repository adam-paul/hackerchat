// socket-server/src/routes/broadcast.ts

import express from 'express';
import { prisma } from '../lib/db';
import { io } from '../index';

const router = express.Router();

// Middleware to verify webhook secret
const verifyWebhookSecret = (req: express.Request, res: express.Response, next: express.NextFunction) => {
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

export default router;
