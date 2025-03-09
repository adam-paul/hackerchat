'use client';

import { useIdleTimer } from '@/lib/hooks/useIdleTimer';
import { useAuthContext } from '@/lib/auth/context';

interface IdleManagerProps {
  idleTimeout?: number;
}

export const IdleManager = ({ idleTimeout }: IdleManagerProps) => {
  const { isAuthenticated } = useAuthContext();
  
  // Only initialize the idle timer if a user is signed in
  if (isAuthenticated) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useIdleTimer(idleTimeout);
  }
  
  // This is a utility component that doesn't render anything
  return null;
};