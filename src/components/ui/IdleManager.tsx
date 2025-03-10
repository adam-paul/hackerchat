'use client';

import { useIdleTimer } from '@/lib/hooks/useIdleTimer';
import { useAuthContext } from '@/lib/auth/context';

interface IdleManagerProps {
  idleTimeout?: number;
}

export const IdleManager = ({ idleTimeout }: IdleManagerProps) => {
  const { isAuthenticated } = useAuthContext();
  
  // Always call the hook to avoid breaking React rules, but only enable it conditionally
  useIdleTimer(idleTimeout, isAuthenticated);
  
  // This is a utility component that doesn't render anything
  return null;
};