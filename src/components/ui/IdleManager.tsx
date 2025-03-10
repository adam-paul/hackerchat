'use client';

import { useIdleTimer } from '@/lib/hooks/useIdleTimer';
import { useAuthContext } from '@/lib/auth/context';
import { useEffect } from 'react';

interface IdleManagerProps {
  idleTimeout?: number;
}

export const IdleManager = ({ idleTimeout }: IdleManagerProps) => {
  const { isAuthenticated, userId } = useAuthContext();
  
  // Always call the hook to avoid breaking React rules, but only enable it conditionally
  const { isIdle } = useIdleTimer(idleTimeout, isAuthenticated);
  
  useEffect(() => {
    console.log(`[IdleManager] Initialization - Auth status: ${isAuthenticated ? 'Authenticated' : 'Not authenticated'}`);
    console.log(`[IdleManager] User ID: ${userId || 'No user'}, timeout: ${idleTimeout}ms, idle: ${isIdle}`);
  }, [isAuthenticated, userId, idleTimeout, isIdle]);
  
  // This is a utility component that doesn't render anything
  return null;
};