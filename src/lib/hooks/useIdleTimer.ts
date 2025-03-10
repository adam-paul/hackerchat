'use client';

import { useEffect, useState, useRef } from 'react';
import { useSocket } from '../socket/context';
import { useAuthContext } from '@/lib/auth/context';
import { useSignOut } from '@clerk/nextjs';

const DEFAULT_IDLE_TIMEOUT = 30 * 60 * 1000; // 30 minutes in milliseconds (overridden by IdleManager)
// Additional timeout before forcing logout (30 seconds after being set to away for testing)
const LOGOUT_GRACE_PERIOD = 30 * 1000; 

export const useIdleTimer = (timeoutMs = DEFAULT_IDLE_TIMEOUT) => {
  const [isIdle, setIsIdle] = useState(false);
  const { updateStatus } = useSocket();
  const { user } = useAuthContext();
  const { signOut } = useSignOut();
  const lastActivityRef = useRef(Date.now());
  const userIdRef = useRef<string | undefined>(undefined);
  const resetCountRef = useRef(0);
  const idleStartTimeRef = useRef<number | null>(null);
  const logoutTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  useEffect(() => {
    // Store user ID for logs
    if (user?.id) {
      userIdRef.current = user.id;
      console.log(`[IdleTimer] Initialized for user ${user.id} with timeout ${timeoutMs}ms`);
    }
  }, [user?.id]);
  
  // Function to perform logout
  const performLogout = async () => {
    console.log(`[IdleTimer] PERFORMING AUTOMATIC LOGOUT for user ${userIdRef.current} - idle for ${Math.floor((Date.now() - (idleStartTimeRef.current || 0)) / 1000)}s`);
    
    try {
      // Set status to offline first
      updateStatus('offline');
      
      // Then sign out
      await signOut();
      console.log(`[IdleTimer] Logout completed successfully for user ${userIdRef.current}`);
    } catch (error) {
      console.error('[IdleTimer] Error during automatic logout:', error);
    }
  };
  
  useEffect(() => {
    let idleTimeout: NodeJS.Timeout | null = null;
    let isActive = true;
    
    // Create an idle check function for logging
    const checkIdleStatus = () => {
      const now = Date.now();
      const idleTime = now - lastActivityRef.current;
      console.log(`[IdleTimer] User ${userIdRef.current} idle check: ${Math.floor(idleTime / 1000)}s idle (threshold: ${timeoutMs / 1000}s)`);
      
      // If user has been idle long enough to be marked as away
      if (idleTime >= timeoutMs) {
        console.log(`[IdleTimer] Setting user ${userIdRef.current} to AWAY - idle for ${Math.floor(idleTime / 1000)}s`);
        updateStatus('away');
        setIsIdle(true);
        
        // Store the time when the user first became idle
        if (idleStartTimeRef.current === null) {
          idleStartTimeRef.current = now;
          
          // Set a timeout for auto-logout after grace period
          console.log(`[IdleTimer] Starting logout timer - will log out in ${LOGOUT_GRACE_PERIOD / 1000}s if still idle`);
          
          if (logoutTimeoutRef.current) {
            clearTimeout(logoutTimeoutRef.current);
          }
          
          logoutTimeoutRef.current = setTimeout(() => {
            // Check if still idle before logging out
            const currentIdleTime = Date.now() - lastActivityRef.current;
            if (currentIdleTime >= timeoutMs) {
              performLogout();
            }
          }, LOGOUT_GRACE_PERIOD);
        }
      }
    };
    
    // Function to reset the timer with debugging
    const resetIdleTimer = (event?: Event) => {
      const resetCount = ++resetCountRef.current;
      const eventType = event ? event.type : 'initial';
      const now = Date.now();
      const idleDuration = now - lastActivityRef.current;
      
      // Log the activity that reset the timer
      console.log(`[IdleTimer] Activity detected (#${resetCount}): ${eventType} - was idle for ${Math.floor(idleDuration / 1000)}s`);
      
      if (idleTimeout) {
        clearTimeout(idleTimeout);
      }
      
      // Update last activity time
      lastActivityRef.current = now;
      
      // If we were idle before, set status back to online
      if (isIdle && isActive) {
        console.log(`[IdleTimer] Setting user ${userIdRef.current} back to ONLINE after activity`);
        updateStatus('online');
        setIsIdle(false);
        
        // Clear idle start time and logout timeout
        idleStartTimeRef.current = null;
        if (logoutTimeoutRef.current) {
          console.log('[IdleTimer] Clearing logout timeout due to activity');
          clearTimeout(logoutTimeoutRef.current);
          logoutTimeoutRef.current = null;
        }
      }
      
      // Set new timeout for idle detection
      idleTimeout = setTimeout(() => {
        checkIdleStatus();
      }, timeoutMs);
      
      console.log(`[IdleTimer] Timer reset, will check again in ${timeoutMs / 1000}s`);
    };
    
    // Throttled version of reset to avoid excessive logs on continuous events
    let lastReset = 0;
    const throttledReset = (event: Event) => {
      const now = Date.now();
      // Only handle if it's been 5 seconds since last reset for certain events
      if (event.type === 'mousemove' || event.type === 'scroll') {
        if (now - lastReset < 5000) return;
      }
      
      lastReset = now;
      resetIdleTimer(event);
    };
    
    // Events to listen for to detect user activity
    const activityEvents = [
      'mousedown', 'keydown', 'touchstart', 'click', 'keypress'
    ];
    
    // Events to listen for but throttle to avoid excessive resets
    const throttledEvents = [
      'mousemove', 'scroll'
    ];
    
    // Add event listeners for user activity
    activityEvents.forEach((event) => {
      window.addEventListener(event, resetIdleTimer, { passive: true });
    });
    
    // Add throttled event listeners
    throttledEvents.forEach((event) => {
      window.addEventListener(event, throttledReset, { passive: true });
    });
    
    // Set up periodic checking (every 10 seconds)
    const periodicCheck = setInterval(() => {
      checkIdleStatus();
    }, 10000);
    
    // Initial timer setup
    resetIdleTimer();
    
    // Cleanup
    return () => {
      console.log(`[IdleTimer] Cleaning up event listeners for user ${userIdRef.current}`);
      isActive = false;
      if (idleTimeout) {
        clearTimeout(idleTimeout);
      }
      if (logoutTimeoutRef.current) {
        clearTimeout(logoutTimeoutRef.current);
      }
      clearInterval(periodicCheck);
      
      activityEvents.forEach((event) => {
        window.removeEventListener(event, resetIdleTimer);
      });
      
      throttledEvents.forEach((event) => {
        window.removeEventListener(event, throttledReset);
      });
    };
  }, [isIdle, timeoutMs, updateStatus, signOut]);
  
  return { isIdle };
};