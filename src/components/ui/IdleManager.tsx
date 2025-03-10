'use client';

import { useIdleTimer } from '@/lib/hooks/useIdleTimer';
import { useAuthContext } from '@/lib/auth/context';
import { useEffect } from 'react';

interface IdleManagerProps {
  idleTimeout?: number;
}

export const IdleManager = ({ idleTimeout }: IdleManagerProps) => {
  const { isAuthenticated, user } = useAuthContext();
  
  useEffect(() => {
    console.log(`[IdleManager] Initialization - Auth status: ${isAuthenticated ? 'Authenticated' : 'Not authenticated'}`);
    console.log(`[IdleManager] User: ${user?.id || 'No user'}, timeout: ${idleTimeout}ms`);
  }, [isAuthenticated, user, idleTimeout]);
  
  // Only initialize the idle timer if a user is signed in
  if (isAuthenticated) {
    console.log(`[IdleManager] Starting idle timer for user ${user?.id} with timeout ${idleTimeout}ms`);
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useIdleTimer(idleTimeout);
  } else {
    console.log('[IdleManager] Not starting idle timer - user not authenticated');
  }
  
  // This is a utility component that doesn't render anything
  return null;
};