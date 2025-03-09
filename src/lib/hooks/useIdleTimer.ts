'use client';

import { useEffect, useState } from 'react';
import { useSocket } from '../socket/context';

const DEFAULT_IDLE_TIMEOUT = 30 * 60 * 1000; // 30 minutes in milliseconds

export const useIdleTimer = (timeoutMs = DEFAULT_IDLE_TIMEOUT) => {
  const [isIdle, setIsIdle] = useState(false);
  const { updateStatus } = useSocket();
  
  useEffect(() => {
    let idleTimeout: NodeJS.Timeout | null = null;
    let isActive = true;
    
    // Function to reset the timer
    const resetIdleTimer = () => {
      if (idleTimeout) {
        clearTimeout(idleTimeout);
      }
      
      // If we were idle before, set status back to online
      if (isIdle && isActive) {
        updateStatus('online');
        setIsIdle(false);
      }
      
      // Set new timeout for idle detection
      idleTimeout = setTimeout(() => {
        updateStatus('away');
        setIsIdle(true);
      }, timeoutMs);
    };
    
    // Events to listen for to detect user activity
    const activityEvents = [
      'mousedown', 'mousemove', 'keydown',
      'scroll', 'touchstart', 'click', 'keypress'
    ];
    
    // Add event listeners for user activity
    activityEvents.forEach((event) => {
      window.addEventListener(event, resetIdleTimer, { passive: true });
    });
    
    // Initial timer setup
    resetIdleTimer();
    
    // Cleanup
    return () => {
      isActive = false;
      if (idleTimeout) {
        clearTimeout(idleTimeout);
      }
      activityEvents.forEach((event) => {
        window.removeEventListener(event, resetIdleTimer);
      });
    };
  }, [isIdle, timeoutMs, updateStatus]);
  
  return { isIdle };
};