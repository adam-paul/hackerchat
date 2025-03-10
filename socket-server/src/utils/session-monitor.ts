// socket-server/src/utils/session-monitor.ts

import { Server } from 'socket.io';
import { prisma } from '../lib/db';
import fetch from 'node-fetch';
// Ensure proper typing for node-fetch Response
type FetchResponse = {
  ok: boolean;
  text: () => Promise<string>;
};

// Interval for checking inactive sessions (1 minute - frequent checks for testing)
const CHECK_INTERVAL = 1 * 60 * 1000; 

// Max time a user can be shown as online without an active connection (2 minutes)
const MAX_DISCONNECTED_TIME = 2 * 60 * 1000;

// Global variable to track the last activity time for each user
const userLastActivity = new Map<string, number>();

// Set of users who are currently marked as online
let onlineUsers = new Set<string>();

// Update a user's last activity time
export const updateUserActivity = (userId: string): void => {
  const now = Date.now();
  const previous = userLastActivity.get(userId);
  userLastActivity.set(userId, now);
  
  console.log(
    `[SessionMonitor] Activity recorded for user ${userId}: ${new Date(now).toISOString()}` +
    (previous ? ` (last: ${Math.floor((now - previous) / 1000)}s ago)` : ' (first activity)')
  );
};

// Force log out a specific user - useful for admin controls or manual intervention
export const forceLogoutUser = async (userId: string): Promise<boolean> => {
  try {
    console.log(`[SessionMonitor] Forcing logout for user ${userId}`);
    await setUserOffline(userId);
    onlineUsers.delete(userId);
    userLastActivity.delete(userId);
    return true;
  } catch (err) {
    console.error(`[SessionMonitor] Error forcing logout for user ${userId}:`, err);
    return false;
  }
};

// Check if a socket still exists in the server for a given user
const isUserConnected = (io: Server, userId: string): boolean => {
  const sockets = Array.from(io.sockets.sockets.values());
  const connected = sockets.some(socket => socket.data?.userId === userId);
  
  if (connected) {
    console.log(`[SessionMonitor] User ${userId} has active socket connection`);
  } else {
    console.log(`[SessionMonitor] User ${userId} has NO active socket connection`);
  }
  
  return connected;
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
      select: { id: true, name: true, status: true, updatedAt: true }
    });
    
    console.log(`[SessionMonitor] Found ${onlineUsersData.length} users currently marked as active in the database:`);
    onlineUsersData.forEach(user => {
      const lastUpdateTime = Math.floor((Date.now() - new Date(user.updatedAt).getTime()) / 1000);
      console.log(
        `[SessionMonitor] User ${user.name} (${user.id}):` +
        `\n  - Status: ${user.status}` +
        `\n  - Last DB Update: ${new Date(user.updatedAt).toISOString()} (${lastUpdateTime}s ago)`
      );
      
      // Add to our tracked set
      onlineUsers.add(user.id);
      
      // Initialize activity time for existing users - use updatedAt as a fallback
      if (!userLastActivity.has(user.id)) {
        userLastActivity.set(user.id, new Date(user.updatedAt).getTime());
      }
    });
    
    console.log(`[SessionMonitor] Started tracking ${onlineUsers.size} users`);
  } catch (err) {
    console.error('[SessionMonitor] Error getting online users:', err);
  }
  
  // Monitor session activity
  const intervalId = setInterval(async () => {
    const now = Date.now();
    console.log(`[SessionMonitor] Running session activity check`);
    
    try {
      // First, fetch all users marked as active in the database
      // This ensures we catch any users that somehow got missed in our tracking set
      const dbActiveUsers = await prisma.user.findMany({
        where: {
          status: { in: ['online', 'away', 'busy'] }
        },
        select: { id: true, name: true, status: true, updatedAt: true }
      });
      
      console.log(`[SessionMonitor] Database shows ${dbActiveUsers.length} active users, our tracker has ${onlineUsers.size} users`);
      
      // Check for any users in the DB that we're not tracking
      for (const user of dbActiveUsers) {
        if (!onlineUsers.has(user.id)) {
          console.log(`[SessionMonitor] Found user in DB that we're not tracking: ${user.name} (${user.id}), status=${user.status}`);
          // Add to our tracked set with DB timestamp as activity
          onlineUsers.add(user.id);
          userLastActivity.set(user.id, new Date(user.updatedAt).getTime());
        }
      }
      
      // Now check all tracked users
      const userCount = onlineUsers.size;
      console.log(`[SessionMonitor] Checking ${userCount} active users`);

      // Check each user who is marked as online - convert Set to Array first to avoid iteration issues
      const userIdsToCheck = Array.from(onlineUsers);
      if (userCount === 0) {
        console.log('[SessionMonitor] No online users to check');
        return;
      }
      
      // Get user details for better logging
      const userDetails = await prisma.user.findMany({
        where: { id: { in: userIdsToCheck } },
        select: { id: true, name: true, status: true }
      });
      
      // Create a map for quick lookups
      const userMap = new Map(userDetails.map(user => [user.id, user]));
      
      // Check each user
      for (const userId of userIdsToCheck) {
        const user = userMap.get(userId);
        const userName = user ? user.name : 'Unknown User';
        const userStatus = user ? user.status : 'unknown';
        
        const lastActivity = userLastActivity.get(userId) || 0;
        const timeSinceActivity = now - lastActivity;
        const idleTimeFormatted = Math.floor(timeSinceActivity/1000);
        const isConnected = isUserConnected(io, userId);
        
        const disconnectedWarning = !isConnected && idleTimeFormatted < Math.floor(MAX_DISCONNECTED_TIME/1000);
        
        console.log(
          `[SessionMonitor] Checking user ${userName} (${userId}):` +
          `\n  - Status: ${userStatus}` +
          `\n  - Connected: ${isConnected ? 'Yes' : 'No'}` +
          `\n  - Last activity: ${new Date(lastActivity).toISOString()}` +
          `\n  - Idle time: ${idleTimeFormatted}s / ${Math.floor(MAX_DISCONNECTED_TIME/1000)}s` +
          (disconnectedWarning ? `\n  - WARNING: User disconnected but still in grace period (${Math.floor(MAX_DISCONNECTED_TIME/1000) - idleTimeFormatted}s remaining)` : '')
        );
        
        // If user is not connected or inactive for too long, set them offline
        if (!isConnected || timeSinceActivity > MAX_DISCONNECTED_TIME) {
          if (!isConnected) {
            console.log(`[SessionMonitor] User ${userName} (${userId}) has no active connection - marking as offline`);
          } else {
            console.log(`[SessionMonitor] User ${userName} (${userId}) exceeded maximum idle time (${Math.floor(MAX_DISCONNECTED_TIME/1000)}s) - marking as offline`);
          }
          
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
  const now = Date.now();
  const lastActivity = userLastActivity.get(userId) || now;
  const timeSinceActivity = now - lastActivity;
  
  console.log(
    `[SessionMonitor] User disconnected: ${userId}` +
    `\n  - Last activity: ${new Date(lastActivity).toISOString()}` +
    `\n  - Time since activity: ${Math.floor(timeSinceActivity/1000)}s` +
    `\n  - Will be marked offline after ${Math.floor(MAX_DISCONNECTED_TIME/1000)}s of inactivity`
  );
  
  // We don't immediately remove them from onlineUsers to allow reconnection
};

// Register user reconnect
export const registerUserConnect = (userId: string): void => {
  const now = Date.now();
  const wasOnline = onlineUsers.has(userId);
  const lastActivity = userLastActivity.get(userId);
  
  console.log(
    `[SessionMonitor] User connected: ${userId}` +
    `\n  - Previously marked as online: ${wasOnline ? 'Yes' : 'No'}` +
    (lastActivity ? `\n  - Last activity: ${new Date(lastActivity).toISOString()} (${Math.floor((now - lastActivity)/1000)}s ago)` : 
                   '\n  - No previous activity recorded')
  );
  
  updateUserActivity(userId);
  onlineUsers.add(userId);
};