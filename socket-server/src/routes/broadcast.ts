// socket-server/src/routes/broadcast.ts

import { Router } from 'express';
import { io } from '..';
import { EVENTS } from '../config/socket';
import { verifyWebhookSecret } from '../middleware/auth';

const router = Router();

// Broadcast status changes
router.post('/broadcast-status', verifyWebhookSecret, (req, res) => {
  const { userId, status } = req.body;
  
  if (!userId || !status) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  io.emit(EVENTS.STATUS_UPDATE, {
    userId,
    status,
    timestamp: new Date().toISOString()
  });

  res.json({ success: true });
});

// Broadcast new channels
router.post('/broadcast-channel', verifyWebhookSecret, (req, res) => {
  const channel = req.body;
  
  if (!channel || !channel.id || !channel.name) {
    return res.status(400).json({ error: 'Invalid channel data' });
  }

  io.emit(EVENTS.CHANNEL_CREATED, channel);
  
  res.json({ success: true });
});

export default router;
