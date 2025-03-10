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
  const now = Date.now();
  userLastActivity.set(userId, now);
};

// Force log out a specific user - useful for admin controls or manual intervention
export const forceLogoutUser = async (userId: string): Promise<boolean> => {
  try {
    await setUserOffline(userId);
    onlineUsers.delete(userId);
    userLastActivity.delete(userId);
    return true;
  } catch (err) {
    console.error('Error forcing logout user:', err);
    return false;
  }
};

// Check if a socket still exists in the server for a given user
const isUserConnected = (io: Server, userId: string): boolean => {
  const sockets = Array.from(io.sockets.sockets.values());
  return sockets.some(socket => socket.data?.userId === userId);
};

// Set a user's status to offline
const setUserOffline = async (userId: string): Promise<void> => {
  try {
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
          console.error('Failed to broadcast status:', await response.text());
        }
      } catch (err) {
        console.error('Error broadcasting status change:', err);
      }
    }
  } catch (err) {
    console.error('Error setting user offline:', err);
  }
};

// Initialize the session monitor
export const initSessionMonitor = async (io: Server): Promise<() => void> => {
  console.log('Initializing session monitor');
  
  // Get all online users on startup
  try {
    const onlineUsersData = await prisma.user.findMany({
      where: {
        status: { in: ['online', 'away', 'busy'] }
      },
      select: { id: true, updatedAt: true }
    });
    
    // Add to our tracked set
    onlineUsersData.forEach(user => {
      onlineUsers.add(user.id);
      
      // Initialize activity time for existing users - use updatedAt as a fallback
      if (!userLastActivity.has(user.id)) {
        userLastActivity.set(user.id, new Date(user.updatedAt).getTime());
      }
    });
    
    console.log(`Session monitor tracking ${onlineUsers.size} users`);
  } catch (err) {
    console.error('Error getting online users:', err);
  }
  
  // Monitor session activity
  const intervalId = setInterval(async () => {
    try {
      // First, fetch all users marked as active in the database
      // This ensures we catch any users that somehow got missed in our tracking set
      const dbActiveUsers = await prisma.user.findMany({
        where: {
          status: { in: ['online', 'away', 'busy'] }
        },
        select: { id: true, updatedAt: true }
      });
      
      // Check for any users in the DB that we're not tracking
      for (const user of dbActiveUsers) {
        if (!onlineUsers.has(user.id)) {
          // Add to our tracked set with DB timestamp as activity
          onlineUsers.add(user.id);
          userLastActivity.set(user.id, new Date(user.updatedAt).getTime());
        }
      }
      
      // Check each user who is marked as online
      const userIdsToCheck = Array.from(onlineUsers);
      if (userIdsToCheck.length === 0) {
        return;
      }
      
      // Get user details
      const userDetails = await prisma.user.findMany({
        where: { id: { in: userIdsToCheck } },
        select: { id: true, name: true }
      });
      
      // Create a map for quick lookups
      const userMap = new Map(userDetails.map(user => [user.id, user]));
      
      // Check each user
      for (const userId of userIdsToCheck) {
        const lastActivity = userLastActivity.get(userId) || 0;
        const timeSinceActivity = Date.now() - lastActivity;
        const isConnected = isUserConnected(io, userId);
        
        // If user is not connected or inactive for too long, set them offline
        if (!isConnected || timeSinceActivity > MAX_DISCONNECTED_TIME) {
          const userName = userMap.get(userId)?.name || userId;
          console.log(`Setting user ${userName} to offline - ${isConnected ? 'inactive' : 'disconnected'}`);
          await setUserOffline(userId);
          onlineUsers.delete(userId);
        }
      }
    } catch (err) {
      console.error('Error in session monitoring:', err);
    }
  }, CHECK_INTERVAL);
  
  // Return cleanup function
  return () => {
    clearInterval(intervalId);
  };
};

// Register user activity from socket events
export const registerUserActivity = (userId: string): void => {
  updateUserActivity(userId);
  onlineUsers.add(userId);
};

// Register user disconnect
export const registerUserDisconnect = (userId: string): void => {
  // We don't immediately remove them from onlineUsers to allow reconnection
};

// Register user reconnect
export const registerUserConnect = (userId: string): void => {
  updateUserActivity(userId);
  onlineUsers.add(userId);
};