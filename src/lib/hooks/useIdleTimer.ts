'use client';

import { useEffect, useState, useRef } from 'react';
import { useSocket } from '../socket/context';
import { useAuthContext } from '@/lib/auth/context';
import { useClerk } from '@clerk/nextjs';

const DEFAULT_IDLE_TIMEOUT = 30 * 60 * 1000; // 30 minutes in milliseconds
// Additional timeout before forcing logout (5 minutes after being set to away)
const LOGOUT_GRACE_PERIOD = 5 * 60 * 1000; 

export const useIdleTimer = (timeoutMs = DEFAULT_IDLE_TIMEOUT, isEnabled = true) => {
  const [isIdle, setIsIdle] = useState(false);
  const { updateStatus } = useSocket();
  const { userId } = useAuthContext();
  const { signOut } = useClerk();
  
  // Use refs for mutable values to maintain state across renders
  const lastActivityRef = useRef(Date.now());
  const userIdRef = useRef<string | null>(null);
  const idleStartTimeRef = useRef<number | null>(null);
  const logoutTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isEnabledRef = useRef(isEnabled);
  
  // Update the enabled status ref when the prop changes
  useEffect(() => {
    isEnabledRef.current = isEnabled;
  }, [isEnabled]);
  
  // Store user ID
  useEffect(() => {
    if (userId) {
      userIdRef.current = userId;
    }
  }, [userId]);
  
  // Function to perform logout
  const performLogout = async () => {
    try {
      // Set status to offline first
      updateStatus('offline');
      // Then sign out
      await signOut();
    } catch (error) {
      console.error('Error during automatic logout:', error);
    }
  };
  
  useEffect(() => {
    // Only set up the idle timer if it's enabled
    if (!isEnabled) {
      return;
    }
    
    let idleTimeout: NodeJS.Timeout | null = null;
    let isActive = true;
    
    // Function to check if user is idle
    const checkIdleStatus = () => {
      if (!isEnabledRef.current) return;
      
      const now = Date.now();
      const idleTime = now - lastActivityRef.current;
      
      // If user has been idle long enough to be marked as away
      if (idleTime >= timeoutMs) {
        updateStatus('away');
        setIsIdle(true);
        
        // Store the time when the user first became idle
        if (idleStartTimeRef.current === null) {
          idleStartTimeRef.current = now;
          
          // Set a timeout for auto-logout after grace period
          if (logoutTimeoutRef.current) {
            clearTimeout(logoutTimeoutRef.current);
          }
          
          logoutTimeoutRef.current = setTimeout(() => {
            if (!isEnabledRef.current) return;
            
            // Check if still idle before logging out
            const currentIdleTime = Date.now() - lastActivityRef.current;
            if (currentIdleTime >= timeoutMs) {
              performLogout();
            }
          }, LOGOUT_GRACE_PERIOD);
        }
      }
    };
    
    // Reset timer on activity
    const resetIdleTimer = (event?: Event) => {
      if (!isEnabledRef.current) return;
      
      if (idleTimeout) {
        clearTimeout(idleTimeout);
      }
      
      // Update last activity time
      lastActivityRef.current = Date.now();
      
      // Always set status back to online if user was idle OR away
      if ((isIdle || isEnabledRef.current) && isActive) {
        updateStatus('online');
        setIsIdle(false);
        
        // Clear idle start time and logout timeout
        idleStartTimeRef.current = null;
        if (logoutTimeoutRef.current) {
          clearTimeout(logoutTimeoutRef.current);
          logoutTimeoutRef.current = null;
        }
      }
      
      // Set new timeout for idle detection
      idleTimeout = setTimeout(checkIdleStatus, timeoutMs);
    };
    
    // Throttled version of reset to avoid excessive calls on continuous events
    let lastReset = 0;
    const throttledReset = (event: Event) => {
      if (!isEnabledRef.current) return;
      
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
    
    // Initial timer setup
    resetIdleTimer();
    
    // Cleanup
    return () => {
      isActive = false;
      if (idleTimeout) {
        clearTimeout(idleTimeout);
      }
      if (logoutTimeoutRef.current) {
        clearTimeout(logoutTimeoutRef.current);
      }
      
      activityEvents.forEach((event) => {
        window.removeEventListener(event, resetIdleTimer);
      });
      
      throttledEvents.forEach((event) => {
        window.removeEventListener(event, throttledReset);
      });
    };
  }, [timeoutMs, updateStatus, signOut, isEnabled]);
  
  return { isIdle };
};