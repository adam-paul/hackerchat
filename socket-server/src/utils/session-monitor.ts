// socket-server/src/utils/session-monitor.ts

import { Server } from 'socket.io';
import { prisma } from '../lib/db';
import fetch from 'node-fetch';
// Ensure proper typing for node-fetch Response
type FetchResponse = {
  ok: boolean;
  text: () => Promise<string>;
};

// Interval for checking inactive sessions (5 minutes)
const CHECK_INTERVAL = 5 * 60 * 1000; 

// Max time a user can be shown as online without an active connection (15 minutes)
const MAX_DISCONNECTED_TIME = 15 * 60 * 1000;

// Global variable to track the last activity time for each user
const userLastActivity = new Map<string, number>();

// Set of users who are currently marked as online
let onlineUsers = new Set<string>();

// Update a user's last activity time
export const updateUserActivity = (userId: string): void => {
  userLastActivity.set(userId, Date.now());
};

// Check if a socket still exists in the server for a given user
const isUserConnected = (io: Server, userId: string): boolean => {
  const sockets = Array.from(io.sockets.sockets.values());
  return sockets.some(socket => socket.data?.userId === userId);
};

// Set a user's status to offline
const setUserOffline = async (userId: string): Promise<void> => {
  try {
    console.log(`[SessionMonitor] Setting user ${userId} to offline due to inactivity`);
    
    // Update user status in database
    await prisma.user.update({
      where: { id: userId },
      data: { status: 'offline' }
    });
    
    // Broadcast status change using webhook endpoint if configured
    if (process.env.SOCKET_WEBHOOK_SECRET && process.env.SOCKET_SERVER_URL) {
      try {
        const response = await fetch(`${process.env.SOCKET_SERVER_URL}/broadcast-status`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.SOCKET_WEBHOOK_SECRET}`
          },
          body: JSON.stringify({
            userId,
            status: 'offline',
            source: 'session-monitor'
          })
        }) as FetchResponse;
        
        if (!response.ok) {
          console.error(`[SessionMonitor] Failed to broadcast status: ${await response.text()}`);
        }
      } catch (err) {
        console.error('[SessionMonitor] Error broadcasting status change:', err);
      }
    }
  } catch (err) {
    console.error('[SessionMonitor] Error setting user offline:', err);
  }
};

// Initialize the session monitor
export const initSessionMonitor = async (io: Server): Promise<() => void> => {
  console.log('[SessionMonitor] Initializing session monitor');
  
  // Get all online users on startup
  try {
    const onlineUsersData = await prisma.user.findMany({
      where: {
        status: { in: ['online', 'away', 'busy'] }
      },
      select: { id: true }
    });
    
    onlineUsers = new Set(onlineUsersData.map(user => user.id));
    console.log(`[SessionMonitor] Found ${onlineUsers.size} users currently online`);
  } catch (err) {
    console.error('[SessionMonitor] Error getting online users:', err);
  }
  
  // Monitor session activity
  const intervalId = setInterval(async () => {
    console.log('[SessionMonitor] Running session activity check');
    
    try {
      // Check each user who is marked as online - convert Set to Array first to avoid iteration issues
      const userIdsToCheck = Array.from(onlineUsers);
      for (const userId of userIdsToCheck) {
        const lastActivity = userLastActivity.get(userId) || 0;
        const timeSinceActivity = Date.now() - lastActivity;
        const isConnected = isUserConnected(io, userId);
        
        console.log(`[SessionMonitor] User ${userId}: Connected=${isConnected}, Last activity=${new Date(lastActivity).toISOString()}, Time since=${Math.floor(timeSinceActivity/1000)}s`);
        
        // If user is not connected or inactive for too long, set them offline
        if (!isConnected || timeSinceActivity > MAX_DISCONNECTED_TIME) {
          await setUserOffline(userId);
          onlineUsers.delete(userId);
        }
      }
    } catch (err) {
      console.error('[SessionMonitor] Error in session monitoring:', err);
    }
  }, CHECK_INTERVAL);
  
  // Return cleanup function
  return () => {
    clearInterval(intervalId);
    console.log('[SessionMonitor] Session monitor stopped');
  };
};

// Register user activity from socket events
export const registerUserActivity = (userId: string): void => {
  updateUserActivity(userId);
  onlineUsers.add(userId);
};

// Register user disconnect
export const registerUserDisconnect = (userId: string): void => {
  console.log(`[SessionMonitor] User disconnected: ${userId}`);
  // We don't immediately remove them from onlineUsers to allow reconnection
};

// Register user reconnect
export const registerUserConnect = (userId: string): void => {
  console.log(`[SessionMonitor] User connected: ${userId}`);
  updateUserActivity(userId);
  onlineUsers.add(userId);
};