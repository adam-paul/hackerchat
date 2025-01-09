// src/lib/auth/context.tsx
'use client';

import { useAuth, useUser } from '@clerk/nextjs';
import { createContext, useContext, useEffect, useState } from 'react';

type UserStatus = 'online' | 'away' | 'offline';

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  userId: string | null;
  userEmail: string | null;
  userName: string | null;
  userImageUrl: string | null;
  userStatus: UserStatus;
  setUserStatus: (status: UserStatus) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { isLoaded: clerkLoaded, userId, isSignedIn } = useAuth();
  const { user } = useUser();
  const [userStatus, setUserStatus] = useState<UserStatus>('online');
  
  // Update online status when window visibility changes
  useEffect(() => {
    const handleVisibilityChange = () => {
      setUserStatus(document.hidden ? 'away' : 'online');
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const value: AuthContextType = {
    isAuthenticated: !!isSignedIn,
    isLoading: !clerkLoaded,
    userId: userId ?? null,
    userEmail: user?.emailAddresses[0]?.emailAddress ?? null,
    userName: user?.username ?? null,
    userImageUrl: user?.imageUrl ?? null,
    userStatus,
    setUserStatus,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
}
